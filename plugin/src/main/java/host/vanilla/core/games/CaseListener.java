package host.vanilla.core.games;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Display;
import org.bukkit.entity.ItemDisplay;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.block.Action;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.inventory.InventoryType;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.util.Transformation;
import org.joml.AxisAngle4f;
import org.joml.Vector3f;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Открытие кейса блоком: игрок ставит помеченный сундук, над ним крутятся
 * предметы, через несколько секунд сайт считает выпадение и объявляет приз.
 */
public final class CaseListener implements Listener {

    /** Сколько крутится барабан до объявления результата, тики. */
    private static final long SPIN_TICKS = 90L;

    private static final List<Material> SPIN_ITEMS = List.of(
            Material.DIAMOND, Material.EMERALD, Material.GOLD_INGOT, Material.NETHERITE_INGOT,
            Material.ENDER_PEARL, Material.AMETHYST_SHARD, Material.HONEYCOMB, Material.NETHER_STAR);

    private final VanillaCorePlugin plugin;
    private final Messages messages;
    /** Кто сейчас крутит барабан: второй кейс подряд ломал бы анимацию. */
    private final Set<UUID> spinning = new HashSet<>();

    public CaseListener(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    /**
     * Установка кейса. Приоритет самый ранний и без ignoreCancelled: кейс —
     * не настоящий блок, и чужие запреты на строительство (защита мира у
     * администрации, приваты плагинов) не должны мешать его открыть.
     */
    @EventHandler(priority = EventPriority.LOWEST)
    public void onPlace(BlockPlaceEvent event) {
        String caseKey = caseKeyOf(event.getItemInHand());
        if (caseKey == null) return;

        // Ставим не блок, а анимацию: сундук остался бы в мире пустышкой.
        event.setCancelled(true);
        open(event.getPlayer(), event.getItemInHand(),
                event.getBlock().getLocation().add(0.5, 0.6, 0.5), caseKey);
    }

    /**
     * Открытие правым кликом. Установку блоком легко потерять: в чужом регионе,
     * в наблюдателе, в воздухе — ничего не произойдёт. Клик работает всегда.
     */
    @EventHandler(priority = EventPriority.LOWEST)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        if (event.getAction() != Action.RIGHT_CLICK_BLOCK && event.getAction() != Action.RIGHT_CLICK_AIR) return;

        ItemStack item = event.getItem();
        String caseKey = caseKeyOf(item);
        if (caseKey == null) return;

        event.setCancelled(true);
        Location center = event.getClickedBlock() != null
                ? event.getClickedBlock().getLocation().add(0.5, 1.6, 0.5)
                : event.getPlayer().getLocation().add(
                        event.getPlayer().getLocation().getDirection().setY(0).normalize().multiply(1.5)).add(0, 1.2, 0);
        open(event.getPlayer(), item, center, caseKey);
    }

    /** Общая часть: проверки, списание предмета и запуск барабана. */
    private void open(Player player, ItemStack item, Location center, String caseKey) {
        if (plugin.jail().isJailed(player)) {
            player.sendMessage(messages.get("cases.jailed"));
            return;
        }
        if (spinning.contains(player.getUniqueId())) {
            player.sendMessage(messages.get("cases.busy"));
            return;
        }
        if (center.getWorld() == null) return;

        spinning.add(player.getUniqueId());
        item.setAmount(item.getAmount() - 1);
        spin(player, center, caseKey);
    }

    /**
     * Открытие командой. Запасной путь на случай, когда клик по предмету
     * перехватывает другой плагин или игрок просто не понял, что делать.
     * Без ключа берётся первый кейс из инвентаря.
     */
    public boolean openFromInventory(Player player, String caseKey) {
        for (ItemStack stack : player.getInventory().getContents()) {
            String key = caseKeyOf(stack);
            if (key == null) continue;
            if (caseKey != null && !key.equalsIgnoreCase(caseKey)) continue;

            Location center = player.getLocation()
                    .add(player.getLocation().getDirection().setY(0).normalize().multiply(1.5))
                    .add(0, 1.2, 0);
            open(player, stack, center, key);
            return true;
        }
        return false;
    }

    /** Ключ кейса у предмета в руке, либо null — значит это обычный предмет. */
    private String caseKeyOf(ItemStack item) {
        if (item == null || !item.hasItemMeta()) return null;
        return item.getItemMeta().getPersistentDataContainer()
                .get(plugin.cases().tag(), PersistentDataType.STRING);
    }

    /** Кейс — оплаченный предмет: его не выбрасывают и не теряют при смерти. */
    @EventHandler(ignoreCancelled = true)
    public void onDrop(PlayerDropItemEvent event) {
        if (caseKeyOf(event.getItemDrop().getItemStack()) == null) return;
        event.setCancelled(true);
        event.getPlayer().sendMessage(messages.get("cases.no-drop"));
    }

    @EventHandler
    public void onDeath(PlayerDeathEvent event) {
        event.getDrops().removeIf(drop -> caseKeyOf(drop) != null);
    }

    /** И не уезжает в сундук: оттуда его забрал бы кто угодно. */
    @EventHandler(ignoreCancelled = true)
    public void onClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) return;
        if (event.getInventory().getType() == InventoryType.CRAFTING) return;

        boolean movingCase = caseKeyOf(event.getCurrentItem()) != null
                || caseKeyOf(event.getCursor()) != null;
        if (!movingCase) return;

        // Клик по своему инвентарю разрешаем, только если предмет остаётся у себя.
        boolean toOwnInventory = event.getClickedInventory() != null
                && event.getClickedInventory().equals(player.getInventory())
                && !event.isShiftClick();
        if (toOwnInventory) return;

        event.setCancelled(true);
        player.sendMessage(messages.get("cases.no-drop"));
    }

    @EventHandler(ignoreCancelled = true)
    public void onDrag(InventoryDragEvent event) {
        if (caseKeyOf(event.getOldCursor()) == null) return;
        if (event.getInventory().getType() == InventoryType.CRAFTING) return;
        event.setCancelled(true);
    }

    /** Барабан: предметы летают по кругу, пока сайт не скажет результат. */
    private void spin(Player player, Location center, String caseKey) {
        ItemDisplay[] displays = new ItemDisplay[3];
        for (int i = 0; i < displays.length; i++) {
            ItemDisplay display = center.getWorld().spawn(center, ItemDisplay.class);
            display.setItemStack(new ItemStack(SPIN_ITEMS.get(i % SPIN_ITEMS.size())));
            display.setBillboard(Display.Billboard.FIXED);
            display.setTransformation(new Transformation(
                    new Vector3f(0, 0, 0), new AxisAngle4f(), new Vector3f(0.6f, 0.6f, 0.6f), new AxisAngle4f()));
            displays[i] = display;
        }

        final int[] tick = {0};
        int task = plugin.getServer().getScheduler().scheduleSyncRepeatingTask(plugin, () -> {
            tick[0]++;
            double phase = tick[0] * 0.25;
            for (int i = 0; i < displays.length; i++) {
                double angle = phase + (Math.PI * 2 / displays.length) * i;
                Location spot = center.clone().add(Math.cos(angle) * 0.8, Math.sin(phase * 2) * 0.15, Math.sin(angle) * 0.8);
                displays[i].teleport(spot);
                // Каждые полсекунды меняем предмет — барабан «перебирает» призы.
                if (tick[0] % 10 == 0) {
                    displays[i].setItemStack(new ItemStack(
                            SPIN_ITEMS.get((tick[0] / 10 + i) % SPIN_ITEMS.size())));
                }
            }
            center.getWorld().spawnParticle(Particle.END_ROD, center, 1, 0.3, 0.2, 0.3, 0.002);
        }, 1L, 1L);

        player.playSound(center, Sound.BLOCK_NOTE_BLOCK_HARP, 0.8f, 1.2f);

        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            plugin.api().onMain(
                    plugin.api().post("/api/mc/cases", Map.of(
                            "action", "open",
                            "login", Accounts.name(player),
                            "caseKey", caseKey)),
                    response -> {
                        plugin.getServer().getScheduler().cancelTask(task);
                        for (ItemDisplay display : displays) display.remove();
                        spinning.remove(player.getUniqueId());

                        String status = response.has("status") ? response.get("status").getAsString() : "error";
                        if (!"ok".equals(status)) {
                            String error = response.has("error")
                                    ? response.get("error").getAsString()
                                    : "сайт не отвечает";
                            player.sendMessage(messages.get("cases.open-failed", Map.of("reason", error)));
                            // Кейс не открылся — возвращаем предмет, деньги уже списаны.
                            plugin.cases().give(player, caseKey, caseKey);
                            return;
                        }

                        announce(player, center, response);
                    });
        }, SPIN_TICKS);
    }

    private void announce(Player player, Location center, com.google.gson.JsonObject response) {
        String kind = response.get("kind").getAsString();
        center.getWorld().spawnParticle(Particle.TOTEM_OF_UNDYING, center, 60, 0.5, 0.6, 0.5, 0.3);
        player.playSound(center, Sound.ENTITY_PLAYER_LEVELUP, 0.9f, 1.4f);

        if (!response.get("cosmetic").isJsonNull()) {
            var cosmetic = response.getAsJsonObject("cosmetic");
            String rarity = cosmetic.get("rarity").getAsString();
            player.sendMessage(messages.get("cases.won-cosmetic", Map.of(
                    "name", cosmetic.get("name").getAsString(),
                    "rarity", rarityName(rarity))));
            showTitle(player, cosmetic.get("name").getAsString(), rarity);
            return;
        }

        int amount = response.get("amount").getAsInt();
        player.sendMessage(messages.get(
                "SHARDS".equals(kind) ? "cases.won-shards" : "cases.won-vc",
                Map.of("amount", String.valueOf(amount))));
        showTitle(player, ("SHARDS".equals(kind) ? "+" + amount + " осколков" : "+" + amount + " VC"), "common");
    }

    private void showTitle(Player player, String text, String rarity) {
        player.showTitle(net.kyori.adventure.title.Title.title(
                Component.text(text, rarityColor(rarity)),
                Component.text("кейс открыт", NamedTextColor.GRAY),
                net.kyori.adventure.title.Title.Times.times(
                        java.time.Duration.ofMillis(200),
                        java.time.Duration.ofSeconds(2),
                        java.time.Duration.ofMillis(500))));
    }

    /** Цвета совпадают с сайтом: редкость должна читаться одинаково везде. */
    public static TextColor rarityColor(String rarity) {
        return switch (rarity) {
            case "legendary" -> TextColor.fromHexString("#f5c451");
            case "epic" -> TextColor.fromHexString("#c77dff");
            case "rare" -> TextColor.fromHexString("#5ea9ff");
            default -> TextColor.fromHexString("#9aa3b2");
        };
    }

    public static String rarityName(String rarity) {
        return switch (rarity) {
            case "legendary" -> "легендарный";
            case "epic" -> "эпический";
            case "rare" -> "редкий";
            default -> "обычный";
        };
    }
}
