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
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.util.Transformation;
import org.joml.AxisAngle4f;
import org.joml.Vector3f;

import java.util.List;
import java.util.Map;

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

    public CaseListener(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        ItemStack item = event.getItemInHand();
        if (!item.hasItemMeta()) return;

        String caseKey = item.getItemMeta().getPersistentDataContainer()
                .get(plugin.cases().tag(), PersistentDataType.STRING);
        if (caseKey == null) return;

        Player player = event.getPlayer();
        // Ставим не блок, а анимацию: сундук остался бы в мире пустышкой.
        event.setCancelled(true);
        if (plugin.jail().isJailed(player)) {
            player.sendMessage(messages.get("cases.jailed"));
            return;
        }

        item.setAmount(item.getAmount() - 1);
        Location center = event.getBlock().getLocation().add(0.5, 0.6, 0.5);
        spin(player, center, caseKey);
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
