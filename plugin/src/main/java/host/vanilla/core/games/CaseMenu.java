package host.vanilla.core.games;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Кейсы в игре: меню с витриной и барабаном в том же окне.
 *
 * Раньше кейс покупался командой, ложился в инвентарь предметом и открывался
 * установкой блока — три действия и объяснение в чате на каждое. Теперь всё в
 * одном окне: выбрал кейс, нажал, там же прокрутилось.
 *
 * Приз решает сайт, и решает его до анимации: барабан только показывает уже
 * известный исход. Иначе пришлось бы либо верить клиенту, либо показывать одно,
 * а выдавать другое.
 */
public final class CaseMenu implements Listener {

    private static final int SIZE = 54;
    /** Барабан — четвёртый ряд, выигрыш встаёт в середину. */
    private static final int REEL_ROW = 27;
    private static final int REEL_WIDTH = 9;
    private static final int WINNER_SLOT = REEL_ROW + 4;

    /** Сколько шагов крутится барабан и как он тормозит. */
    private static final int SPIN_STEPS = 34;

    private final VanillaCorePlugin plugin;
    private final Messages messages;
    private final NamespacedKey caseTag;
    /** Метка уже оплаченного кейса: такой открывается без второго списания. */
    private final NamespacedKey ticketTag;

    /** Что сейчас открыто у игрока: витрина или барабан. */
    private final Map<UUID, String> viewing = new HashMap<>();
    /** Идущие прокрутки: во время них окно закрывать нельзя. */
    private final Map<UUID, BukkitTask> spins = new HashMap<>();
    /** Витрина, полученная с сайта: держим, чтобы не ходить за ней на каждый клик. */
    private final Map<UUID, JsonArray> shelf = new HashMap<>();

    public CaseMenu(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
        this.caseTag = new NamespacedKey(plugin, "menu_case_key");
        this.ticketTag = new NamespacedKey(plugin, "menu_ticket_key");
    }

    /** Открывает витрину: список кейсов с ценами и содержимым. */
    public void open(Player player) {
        plugin.api().onMain(
                plugin.api().get("/api/mc/cases?login=" + Accounts.name(player)),
                response -> {
                    if (!player.isOnline()) return;
                    if (response.get("_status").getAsInt() != 200) {
                        player.sendMessage(messages.get("cases.api-down"));
                        return;
                    }
                    JsonArray cases = response.getAsJsonArray("cases");
                    int balance = response.get("balance").isJsonNull()
                            ? 0 : response.get("balance").getAsInt();
                    shelf.put(player.getUniqueId(), cases);
                    showShelf(player, cases, balance, response.getAsJsonArray("tickets"));
                });
    }

    private void showShelf(Player player, JsonArray cases, int balance, JsonArray tickets) {
        Inventory inventory = plugin.getServer().createInventory(null, SIZE,
                messages.plain("cases.menu-title", Map.of("balance", String.valueOf(balance))));

        fill(inventory, Material.BLACK_STAINED_GLASS_PANE);

        // Кейсы ставим во второй ряд по центру: так они не сливаются с рамкой.
        int[] slots = {11, 12, 13, 14, 15, 20, 21, 22, 23, 24};
        for (int i = 0; i < cases.size() && i < slots.length; i++) {
            JsonObject item = cases.get(i).getAsJsonObject();
            inventory.setItem(slots[i], caseIcon(item, balance));
        }

        // Оплаченные, но не открытые кейсы — отдельной строкой снизу. Без неё
        // купленное на сайте или недокрученное просто исчезло бы из виду.
        int slot = 38;
        for (int i = 0; tickets != null && i < tickets.size() && slot <= 42; i++) {
            JsonObject ticket = tickets.get(i).getAsJsonObject();
            inventory.setItem(slot++, ticketIcon(ticket, cases));
        }

        viewing.put(player.getUniqueId(), "shelf");
        player.openInventory(inventory);
        player.playSound(player.getLocation(), Sound.BLOCK_CHEST_OPEN, 0.6f, 1.3f);
    }

    private ItemStack caseIcon(JsonObject data, int balance) {
        int price = data.get("priceVc").getAsInt();
        boolean affordable = balance >= price;

        ItemStack icon = new ItemStack(affordable ? Material.CHEST : Material.BARREL);
        ItemMeta meta = icon.getItemMeta();
        meta.displayName(plain(data.get("name").getAsString(), accentOf(data)));

        List<Component> lore = new ArrayList<>();
        lore.add(plain(price + " VC", affordable ? NamedTextColor.GOLD : NamedTextColor.RED));
        if (!affordable) lore.add(plain("Не хватает " + (price - balance) + " VC", NamedTextColor.DARK_RED));
        lore.add(Component.empty());

        // Показываем самое ценное: полный список не влезет, да и не нужен —
        // подробные шансы есть на сайте.
        JsonArray items = data.getAsJsonArray("items");
        List<JsonObject> best = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) best.add(items.get(i).getAsJsonObject());
        best.sort((left, right) -> Double.compare(
                right.get("chance").getAsDouble(), left.get("chance").getAsDouble()));
        for (int i = best.size() - 1, shown = 0; i >= 0 && shown < 5; i--, shown++) {
            JsonObject entry = best.get(i);
            lore.add(plain("• " + entry.get("label").getAsString()
                            + "  " + entry.get("chance").getAsDouble() + "%",
                    rarityColor(entry)));
        }

        lore.add(Component.empty());
        lore.add(plain(affordable ? "Нажмите, чтобы открыть" : "Пополните баланс на сайте",
                affordable ? NamedTextColor.GREEN : NamedTextColor.GRAY));
        meta.lore(lore);
        meta.getPersistentDataContainer().set(caseTag, PersistentDataType.STRING,
                data.get("key").getAsString());
        icon.setItemMeta(meta);
        return icon;
    }

    private ItemStack ticketIcon(JsonObject ticket, JsonArray cases) {
        String key = ticket.get("caseKey").getAsString();
        int count = ticket.get("count").getAsInt();
        String name = key;
        for (int i = 0; i < cases.size(); i++) {
            JsonObject entry = cases.get(i).getAsJsonObject();
            if (entry.get("key").getAsString().equals(key)) name = entry.get("name").getAsString();
        }

        ItemStack icon = new ItemStack(Material.ENDER_CHEST);
        icon.setAmount(Math.max(1, Math.min(64, count)));
        ItemMeta meta = icon.getItemMeta();
        meta.displayName(plain(name + " — оплачен", NamedTextColor.AQUA));
        meta.lore(List.of(
                plain("Куплен, но не открыт: " + count + " шт.", NamedTextColor.GRAY),
                plain("Нажмите, чтобы открыть без оплаты", NamedTextColor.GREEN)));
        meta.getPersistentDataContainer().set(ticketTag, PersistentDataType.STRING, key);
        icon.setItemMeta(meta);
        return icon;
    }

    // ─────────────────────────────── барабан ───────────────────────────────

    /**
     * Покупает кейс и сразу его открывает, а потом показывает прокрутку.
     *
     * Сначала деньги и приз, потом анимация: если игрок выйдет посреди
     * прокрутки, выигрыш уже у него, и разбираться постфактум не придётся.
     */
    private void buyAndSpin(Player player, String caseKey) {
        plugin.api().onMain(
                plugin.api().post("/api/mc/cases", Map.of(
                        "action", "buy",
                        "login", Accounts.name(player),
                        "caseKey", caseKey)),
                bought -> {
                    if (!player.isOnline()) return;
                    if (!"ok".equals(status(bought))) {
                        player.sendMessage(messages.get("cases.buy-failed",
                                Map.of("reason", error(bought))));
                        player.playSound(player.getLocation(), Sound.ENTITY_VILLAGER_NO, 0.8f, 1f);
                        return;
                    }
                    plugin.auth().profile(player).setBalanceVc(bought.get("balance").getAsInt());

                    plugin.api().onMain(
                            plugin.api().post("/api/mc/cases", Map.of(
                                    "action", "open",
                                    "login", Accounts.name(player),
                                    "caseKey", caseKey)),
                            opened -> {
                                if (!player.isOnline()) return;
                                if (!"ok".equals(status(opened))) {
                                    // Кейс оплачен, но не открылся: он остался
                                    // оплаченным на сайте, и его выдаст /cases.
                                    player.sendMessage(messages.get("cases.buy-failed",
                                            Map.of("reason", error(opened))));
                                    return;
                                }
                                spin(player, caseKey, opened);
                            });
                });
    }

    /** Открывает уже оплаченный кейс: второй раз за него не списываем. */
    private void openPaid(Player player, String caseKey) {
        plugin.api().onMain(
                plugin.api().post("/api/mc/cases", Map.of(
                        "action", "open",
                        "login", Accounts.name(player),
                        "caseKey", caseKey)),
                opened -> {
                    if (!player.isOnline()) return;
                    if (!"ok".equals(status(opened))) {
                        player.sendMessage(messages.get("cases.buy-failed",
                                Map.of("reason", error(opened))));
                        return;
                    }
                    spin(player, caseKey, opened);
                });
    }

    private void spin(Player player, String caseKey, JsonObject result) {
        JsonArray items = itemsOf(player, caseKey);
        Inventory inventory = plugin.getServer().createInventory(null, SIZE,
                messages.plain("cases.spin-title", Map.of()));
        fill(inventory, Material.BLACK_STAINED_GLASS_PANE);
        // Указатели над и под серединой: без них непонятно, где остановится.
        inventory.setItem(WINNER_SLOT - 9, marker());
        inventory.setItem(WINNER_SLOT + 9, marker());

        viewing.put(player.getUniqueId(), "spin");
        player.openInventory(inventory);

        ItemStack prize = prizeIcon(result);
        List<ItemStack> strip = new ArrayList<>();
        for (int i = 0; i < REEL_WIDTH; i++) strip.add(randomIcon(items));

        final int[] step = {0};

        BukkitTask task = plugin.getServer().getScheduler().runTaskTimer(plugin, new Runnable() {
            private int sinceMove;

            @Override
            public void run() {
                if (!player.isOnline()) {
                    stop(player);
                    return;
                }
                sinceMove++;
                // Тормозим к концу: шаг задерживается всё дольше, как у колеса.
                long need = step[0] < SPIN_STEPS - 10 ? 1L : 1L + (step[0] - (SPIN_STEPS - 10));
                if (sinceMove < need) return;
                sinceMove = 0;

                strip.remove(0);
                // Последним заезжает настоящий приз: к этому моменту барабан
                // уже почти стоит, и подмены не видно.
                strip.add(step[0] == SPIN_STEPS - 1 ? prize : randomIcon(items));

                for (int i = 0; i < REEL_WIDTH; i++) {
                    inventory.setItem(REEL_ROW + i, strip.get(i));
                }
                player.playSound(player.getLocation(), Sound.BLOCK_NOTE_BLOCK_HAT, 0.5f, 1.2f);

                step[0]++;
                if (step[0] > SPIN_STEPS + 4) {
                    inventory.setItem(WINNER_SLOT, prize);
                    reveal(player, result);
                    stop(player);
                }
            }
        }, 2L, 1L);

        spins.put(player.getUniqueId(), task);
    }

    /** Барабан докрутился: объявляем приз в окне и в чате. */
    private void reveal(Player player, JsonObject result) {
        boolean duplicate = result.has("duplicate") && result.get("duplicate").getAsBoolean();
        String line;
        if (result.has("cosmetic") && result.get("cosmetic").isJsonObject()) {
            String name = result.getAsJsonObject("cosmetic").get("name").getAsString();
            line = duplicate
                    ? name + " — дубль, начислено " + result.get("refundVc").getAsInt() + " VC"
                    : name;
        } else {
            line = "+" + result.get("amount").getAsInt() + " VC";
        }

        player.sendMessage(messages.get("cases.won", Map.of("prize", line)));
        player.playSound(player.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 0.8f, 1.4f);
        if (result.has("balance")) {
            plugin.auth().profile(player).setBalanceVc(result.get("balance").getAsInt());
        }
    }

    private void stop(Player player) {
        BukkitTask task = spins.remove(player.getUniqueId());
        if (task != null) task.cancel();
    }

    // ──────────────────────────────── события ──────────────────────────────

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        String screen = viewing.get(player.getUniqueId());
        if (screen == null) return;

        // Своё окно: перекладывать из него нечего, и нижний инвентарь тоже
        // запираем — иначе приз можно было бы «положить» в барабан.
        event.setCancelled(true);
        if (!"shelf".equals(screen)) return;

        ItemStack clicked = event.getCurrentItem();
        if (clicked == null || !clicked.hasItemMeta()) return;
        var tags = clicked.getItemMeta().getPersistentDataContainer();
        String paid = tags.get(ticketTag, PersistentDataType.STRING);
        if (paid != null) {
            openPaid(player, paid);
            return;
        }
        String caseKey = tags.get(caseTag, PersistentDataType.STRING);
        if (caseKey == null) return;

        buyAndSpin(player, caseKey);
    }

    @EventHandler
    public void onDrag(InventoryDragEvent event) {
        if (event.getWhoClicked() instanceof Player player && viewing.containsKey(player.getUniqueId())) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onClose(InventoryCloseEvent event) {
        if (!(event.getPlayer() instanceof Player player)) return;
        viewing.remove(player.getUniqueId());
        // Прокрутку не обрываем молча: приз уже выдан, и игрок должен о нём
        // узнать, даже если закрыл окно на полпути.
        stop(player);
    }

    public void forget(Player player) {
        viewing.remove(player.getUniqueId());
        shelf.remove(player.getUniqueId());
        stop(player);
    }

    // ──────────────────────────────── мелочи ───────────────────────────────

    private JsonArray itemsOf(Player player, String caseKey) {
        JsonArray cases = shelf.get(player.getUniqueId());
        if (cases == null) return new JsonArray();
        for (int i = 0; i < cases.size(); i++) {
            JsonObject entry = cases.get(i).getAsJsonObject();
            if (entry.get("key").getAsString().equals(caseKey)) {
                return entry.getAsJsonArray("items");
            }
        }
        return new JsonArray();
    }

    private ItemStack randomIcon(JsonArray items) {
        if (items.isEmpty()) return new ItemStack(Material.GOLD_NUGGET);
        JsonObject entry = items.get(ThreadLocalRandom.current().nextInt(items.size())).getAsJsonObject();
        ItemStack icon = new ItemStack(iconFor(entry));
        ItemMeta meta = icon.getItemMeta();
        meta.displayName(plain(entry.get("label").getAsString(), rarityColor(entry)));
        icon.setItemMeta(meta);
        return icon;
    }

    private ItemStack prizeIcon(JsonObject result) {
        boolean cosmetic = result.has("cosmetic") && result.get("cosmetic").isJsonObject();
        String label = cosmetic
                ? result.getAsJsonObject("cosmetic").get("name").getAsString()
                : "+" + result.get("amount").getAsInt() + " VC";
        Material material = cosmetic ? Material.NETHER_STAR : Material.GOLD_INGOT;

        ItemStack icon = new ItemStack(material);
        ItemMeta meta = icon.getItemMeta();
        meta.displayName(plain(label, cosmetic
                ? CaseListener.rarityColor(result.getAsJsonObject("cosmetic").get("rarity").getAsString())
                : NamedTextColor.GOLD));
        icon.setItemMeta(meta);
        return icon;
    }

    private Material iconFor(JsonObject entry) {
        if (entry.get("rarity").isJsonNull()) return Material.GOLD_NUGGET;
        return switch (entry.get("rarity").getAsString()) {
            case "legendary" -> Material.NETHER_STAR;
            case "epic" -> Material.AMETHYST_SHARD;
            case "rare" -> Material.LAPIS_LAZULI;
            default -> Material.IRON_NUGGET;
        };
    }

    private TextColor rarityColor(JsonObject entry) {
        if (entry.get("rarity").isJsonNull()) return NamedTextColor.GOLD;
        return CaseListener.rarityColor(entry.get("rarity").getAsString());
    }

    private TextColor accentOf(JsonObject data) {
        if (!data.has("accent") || data.get("accent").isJsonNull()) return NamedTextColor.GOLD;
        TextColor parsed = TextColor.fromHexString(data.get("accent").getAsString());
        return parsed == null ? NamedTextColor.GOLD : parsed;
    }

    private static Component plain(String text, TextColor color) {
        return Component.text(text, color).decoration(TextDecoration.ITALIC, false);
    }

    private ItemStack marker() {
        ItemStack item = new ItemStack(Material.SPECTRAL_ARROW);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(plain("▼", NamedTextColor.YELLOW));
        item.setItemMeta(meta);
        return item;
    }

    private void fill(Inventory inventory, Material material) {
        ItemStack pane = new ItemStack(material);
        ItemMeta meta = pane.getItemMeta();
        meta.displayName(Component.empty());
        pane.setItemMeta(meta);
        for (int i = 0; i < inventory.getSize(); i++) inventory.setItem(i, pane);
    }

    private static String status(JsonObject response) {
        return response.has("status") ? response.get("status").getAsString() : "error";
    }

    private static String error(JsonObject response) {
        return response.has("error") ? response.get("error").getAsString() : "сайт не отвечает";
    }
}
