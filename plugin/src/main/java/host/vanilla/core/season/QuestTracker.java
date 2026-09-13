package host.vanilla.core.season;

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
import org.bukkit.Sound;
import org.bukkit.block.data.Ageable;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.inventory.CraftItemEvent;
import org.bukkit.event.inventory.InventoryAction;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Осенний ивент: считает прогресс заданий и показывает его игроку.
 *
 * Список заданий плагин не знает наизусть, а забирает с сайта: задания живут в
 * одном месте, и правка в коде сайта не требует пересборки jar и остановки
 * игрового сервера. Ответ кэшируется — он меняется раз в двое суток, а
 * спрашивать его на каждый сломанный лист было бы разорительно.
 *
 * Счётчики копятся в памяти и уходят на сайт пачкой раз в несколько секунд. На
 * роще из двух тысяч листьев поштучные запросы — это сотни обращений в минуту
 * с одного игрока.
 *
 * Засчитывает сайт, а не плагин: он же хранит прогресс и выдаёт кейс. Плагин
 * только называет, что произошло.
 */
public final class QuestTracker implements Listener {

    /** Как часто сбрасываем накопленное на сайт. */
    private static final long FLUSH_TICKS = 100L;
    /** Как часто обновляем список заданий. */
    private static final long REFRESH_TICKS = 20L * 300;

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    /** Задания с сайта в порядке открытия. */
    private final List<JsonObject> quests = new ArrayList<>();
    /** «BREAK:WHEAT» → ключ задания: по событию сразу видно, к чему оно относится. */
    private final Map<String, String> index = new HashMap<>();
    private boolean eventOn;

    /** Что накопилось и ещё не ушло: игрок → «задание|предмет» → сколько. */
    private final Map<UUID, Map<String, Integer>> pending = new HashMap<>();

    public QuestTracker(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    public void start() {
        refresh();
        plugin.getServer().getScheduler().runTaskTimer(plugin, this::refresh, REFRESH_TICKS, REFRESH_TICKS);
        plugin.getServer().getScheduler().runTaskTimer(plugin, this::flush, FLUSH_TICKS, FLUSH_TICKS);
    }

    public boolean running() {
        return eventOn;
    }

    /** Забирает с сайта список заданий и строит указатель «что к чему относится». */
    private void refresh() {
        plugin.api().onMain(plugin.api().get("/api/mc/quests"), response -> {
            if (response.get("_status").getAsInt() != 200) return;

            eventOn = response.getAsJsonObject("event").get("enabled").getAsBoolean();
            quests.clear();
            index.clear();

            JsonArray list = response.getAsJsonArray("quests");
            for (int i = 0; i < list.size(); i++) {
                JsonObject quest = list.get(i).getAsJsonObject();
                quests.add(quest);
                if (!quest.get("open").getAsBoolean()) continue;

                String goal = quest.get("goal").getAsString();
                JsonArray tokens = quest.getAsJsonArray("tokens");
                for (int t = 0; t < tokens.size(); t++) {
                    index.put(goal + ":" + tokens.get(t).getAsString(), quest.get("key").getAsString());
                }
            }
        });
    }

    // ────────────────────────────── события ──────────────────────────────

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        if (!eventOn) return;
        Material material = event.getBlock().getType();

        // Недозрелые посевы не в счёт: иначе задание закрывалось бы вытаптыванием
        // чужого поля, а не урожаем.
        if (event.getBlock().getBlockData() instanceof Ageable ageable
                && ageable.getMaximumAge() > 0 && ageable.getAge() < ageable.getMaximumAge()) {
            return;
        }
        count(event.getPlayer(), "BREAK", material.name());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onKill(EntityDeathEvent event) {
        if (!eventOn) return;
        Player killer = event.getEntity().getKiller();
        if (killer == null) return;
        count(killer, "KILL", event.getEntityType().name());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onCraft(CraftItemEvent event) {
        if (!eventOn) return;
        if (!(event.getWhoClicked() instanceof Player player)) return;

        ItemStack result = event.getRecipe().getResult();
        // Крафт с шифтом делает сразу целую пачку, и считать его за одну штуку
        // нечестно. Сколько именно выйдет, заранее знает только сервер, поэтому
        // сверяем инвентарь на следующий тик.
        if (event.getAction() == InventoryAction.MOVE_TO_OTHER_INVENTORY) {
            Material material = result.getType();
            int before = count(player.getInventory(), material);
            plugin.getServer().getScheduler().runTask(plugin, () -> {
                int made = count(player.getInventory(), material) - before;
                if (made > 0) count(player, "CRAFT", material.name(), made);
            });
            return;
        }
        count(player, "CRAFT", result.getType().name(), result.getAmount());
    }

    private static int count(Inventory inventory, Material material) {
        int total = 0;
        for (ItemStack item : inventory.getContents()) {
            if (item != null && item.getType() == material) total += item.getAmount();
        }
        return total;
    }

    private void count(Player player, String goal, String token) {
        count(player, goal, token, 1);
    }

    private void count(Player player, String goal, String token, int amount) {
        String quest = index.get(goal + ":" + token);
        if (quest == null || amount <= 0) return;
        pending.computeIfAbsent(player.getUniqueId(), id -> new LinkedHashMap<>())
                .merge(quest + "|" + token, amount, Integer::sum);
    }

    // ─────────────────────────────── отправка ───────────────────────────────

    private void flush() {
        if (pending.isEmpty()) return;
        Map<UUID, Map<String, Integer>> batch = new HashMap<>(pending);
        pending.clear();

        batch.forEach((id, counters) -> {
            Player player = plugin.getServer().getPlayer(id);
            if (player == null) return;

            List<Map<String, Object>> entries = new ArrayList<>();
            counters.forEach((key, amount) -> {
                String[] parts = key.split("\\|", 2);
                entries.add(Map.of("quest", parts[0], "token", parts[1], "amount", amount));
            });

            send(player, entries);
        });
    }

    private void send(Player player, List<Map<String, Object>> entries) {
        plugin.api().onMain(
                plugin.api().post("/api/mc/quests", Map.of(
                        "login", Accounts.name(player),
                        "entries", entries)),
                response -> {
                    if (!player.isOnline()) return;
                    if (response.get("_status").getAsInt() != 200) return;
                    JsonArray advanced = response.getAsJsonArray("advanced");
                    for (int i = 0; advanced != null && i < advanced.size(); i++) {
                        announce(player, advanced.get(i).getAsJsonObject());
                    }
                });
    }

    /** Круг закрыт — говорим об этом, остальное игрок смотрит в меню сам. */
    private void announce(Player player, JsonObject result) {
        if (!result.get("completed").getAsBoolean()) return;
        player.sendMessage(messages.get("quest.done", Map.of(
                "quest", title(result.get("key").getAsString()),
                "cooldown", human(result.get("cooldownSec").getAsInt()))));
        player.playSound(player.getLocation(), Sound.UI_TOAST_CHALLENGE_COMPLETE, 0.8f, 1f);
    }

    private String title(String key) {
        for (JsonObject quest : quests) {
            if (quest.get("key").getAsString().equals(key)) return quest.get("title").getAsString();
        }
        return key;
    }

    // ──────────────────────────────── меню ────────────────────────────────

    /** Показывает задания с прогрессом: для этого нужен свежий ответ по игроку. */
    public void open(Player player) {
        plugin.api().onMain(
                plugin.api().get("/api/mc/quests?login=" + Accounts.name(player)),
                response -> {
                    if (!player.isOnline()) return;
                    if (response.get("_status").getAsInt() != 200) {
                        player.sendMessage(messages.get("quest.api-down"));
                        return;
                    }
                    JsonObject event = response.getAsJsonObject("event");
                    if (!event.get("enabled").getAsBoolean()) {
                        player.sendMessage(messages.get("quest.off"));
                        return;
                    }
                    show(player, event, response.getAsJsonArray("quests"));
                });
    }

    private void show(Player player, JsonObject event, JsonArray list) {
        Inventory inventory = plugin.getServer().createInventory(null, 27,
                messages.plain("quest.menu-title", Map.of(
                        "day", String.valueOf(event.get("day").getAsInt()))));

        int slot = 10;
        for (int i = 0; i < list.size() && slot <= 16; i++) {
            inventory.setItem(slot++, icon(list.get(i).getAsJsonObject()));
        }
        player.openInventory(inventory);
        player.playSound(player.getLocation(), Sound.ITEM_BOOK_PAGE_TURN, 0.7f, 1.1f);
    }

    private ItemStack icon(JsonObject quest) {
        boolean open = quest.get("open").getAsBoolean();
        int amount = quest.get("amount").getAsInt();
        int target = quest.get("target").getAsInt();
        int cooldown = quest.get("cooldownSec").getAsInt();

        ItemStack item = new ItemStack(open
                ? (cooldown > 0 ? Material.CLOCK : Material.WRITABLE_BOOK)
                : Material.GRAY_DYE);
        ItemMeta meta = item.getItemMeta();
        meta.displayName(plain(quest.get("title").getAsString(),
                open ? NamedTextColor.GOLD : NamedTextColor.DARK_GRAY));

        List<Component> lore = new ArrayList<>();
        for (String line : wrap(quest.get("story").getAsString())) {
            lore.add(plain(line, NamedTextColor.GRAY));
        }
        lore.add(Component.empty());
        if (!open) {
            lore.add(plain("Откроется на " + quest.get("opensOnDay").getAsInt() + "-й день ивента",
                    NamedTextColor.DARK_GRAY));
        } else if (cooldown > 0) {
            lore.add(plain("Сдано. Новый круг через " + human(cooldown), NamedTextColor.YELLOW));
        } else {
            lore.add(plain(bar(amount, target) + "  " + amount + " / " + target, NamedTextColor.GREEN));
            if ("DELIVER".equals(quest.get("goal").getAsString())) {
                lore.add(plain("Сдать из рюкзака: /event сдать", NamedTextColor.AQUA));
            }
        }
        int rounds = quest.get("rounds").getAsInt();
        if (rounds > 0) lore.add(plain("Кругов сдано: " + rounds, NamedTextColor.DARK_AQUA));

        meta.lore(lore);
        item.setItemMeta(meta);
        return item;
    }

    /** Полоска из символов: в подсказке предмета другого прогресс-бара нет. */
    private static String bar(int amount, int target) {
        int filled = target <= 0 ? 0 : Math.min(20, amount * 20 / target);
        return "▌".repeat(filled) + "░".repeat(20 - filled);
    }

    private static String human(int seconds) {
        int hours = seconds / 3600;
        int minutes = (seconds % 3600) / 60;
        return hours > 0 ? hours + " ч " + minutes + " мин" : Math.max(1, minutes) + " мин";
    }

    /** Описание в подсказке предмета не переносится само — режем по словам. */
    private static List<String> wrap(String text) {
        List<String> lines = new ArrayList<>();
        StringBuilder line = new StringBuilder();
        for (String word : text.split(" ")) {
            if (line.length() + word.length() > 42) {
                lines.add(line.toString());
                line = new StringBuilder();
            }
            if (!line.isEmpty()) line.append(' ');
            line.append(word);
        }
        if (!line.isEmpty()) lines.add(line.toString());
        return lines;
    }

    private static Component plain(String text, TextColor color) {
        return Component.text(text, color).decoration(TextDecoration.ITALIC, false);
    }

    // ─────────────────────────────── сдача ───────────────────────────────

    /**
     * Сдаёт из рюкзака всё, что подходит открытым заданиям на сдачу.
     *
     * Берём ровно столько, сколько осталось до цели: игрок не должен терять
     * лишние пироги потому, что зашёл сдать пораньше. Остаток нужного мы знаем
     * из свежего ответа сайта, поэтому сначала спрашиваем прогресс, и только
     * потом трогаем инвентарь.
     */
    public void deliver(Player player) {
        plugin.api().onMain(
                plugin.api().get("/api/mc/quests?login=" + Accounts.name(player)),
                response -> {
                    if (!player.isOnline()) return;
                    if (response.get("_status").getAsInt() != 200) {
                        player.sendMessage(messages.get("quest.api-down"));
                        return;
                    }
                    if (!response.getAsJsonObject("event").get("enabled").getAsBoolean()) {
                        player.sendMessage(messages.get("quest.off"));
                        return;
                    }
                    takeAndSend(player, response.getAsJsonArray("quests"));
                });
    }

    private void takeAndSend(Player player, JsonArray list) {
        List<Map<String, Object>> entries = new ArrayList<>();

        for (int i = 0; i < list.size(); i++) {
            JsonObject quest = list.get(i).getAsJsonObject();
            if (!quest.get("open").getAsBoolean()) continue;
            if (!"DELIVER".equals(quest.get("goal").getAsString())) continue;
            if (quest.get("cooldownSec").getAsInt() > 0) continue;

            int left = quest.get("target").getAsInt() - quest.get("amount").getAsInt();
            if (left <= 0) continue;

            JsonArray tokens = quest.getAsJsonArray("tokens");
            for (int t = 0; t < tokens.size() && left > 0; t++) {
                Material material = Material.matchMaterial(tokens.get(t).getAsString());
                if (material == null) continue;

                int taken = take(player, material, left);
                if (taken <= 0) continue;
                left -= taken;
                entries.add(Map.of(
                        "quest", quest.get("key").getAsString(),
                        "token", material.name(),
                        "amount", taken));
            }
        }

        if (entries.isEmpty()) {
            player.sendMessage(messages.get("quest.nothing"));
            return;
        }

        int total = entries.stream().mapToInt(entry -> (int) entry.get("amount")).sum();
        player.sendMessage(messages.get("quest.delivered", Map.of("amount", String.valueOf(total))));
        send(player, entries);
    }

    /** Забирает из рюкзака не больше нужного и возвращает, сколько забрал. */
    private int take(Player player, Material material, int limit) {
        int taken = 0;
        ItemStack[] contents = player.getInventory().getContents();
        for (int slot = 0; slot < contents.length && taken < limit; slot++) {
            ItemStack item = contents[slot];
            if (item == null || item.getType() != material) continue;
            // Именованные и зачарованные предметы не трогаем: под задание мог бы
            // уйти подписанный пирог с чужого дня рождения.
            if (item.hasItemMeta() && item.getItemMeta().hasDisplayName()) continue;

            int move = Math.min(item.getAmount(), limit - taken);
            taken += move;
            if (move >= item.getAmount()) {
                player.getInventory().setItem(slot, null);
            } else {
                item.setAmount(item.getAmount() - move);
            }
        }
        if (taken > 0) player.updateInventory();
        return taken;
    }

    public void forget(Player player) {
        pending.remove(player.getUniqueId());
    }
}
