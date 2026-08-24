package host.vanilla.core.shop;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Команды купленного в магазине: телепорт по согласию, дом, возврат к месту
 * смерти, эндер-сундук и верстак. Ничего из этого не даёт преимущества в бою.
 */
public final class ShopCommands implements CommandExecutor, TabCompleter {

    /** Запрос телепорта живёт минуту — иначе согласие теряет смысл. */
    private static final long REQUEST_TTL_MS = 60_000;
    /** Вернуться на место смерти можно только по горячим следам. */
    private static final long BACK_TTL_MS = 15 * 60_000;

    private record Request(UUID from, long createdAt) {}

    private final VanillaCorePlugin plugin;
    private final Messages messages;
    private final Map<UUID, Request> requests = new HashMap<>();
    private final Map<UUID, Long> deathTimes = new HashMap<>();

    public ShopCommands(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Команда доступна только в игре");
            return true;
        }
        if (!plugin.auth().authenticated(player)) {
            player.sendMessage(messages.get("auth.prompt"));
            return true;
        }

        return switch (command.getName().toLowerCase(Locale.ROOT)) {
            case "shop" -> shop(player);
            case "tpa" -> tpa(player, args);
            case "tpaccept" -> answer(player, true);
            case "tpdeny" -> answer(player, false);
            case "sethome" -> setHome(player);
            case "home" -> home(player);
            case "back" -> back(player);
            case "ec" -> container(player, "enderchest");
            case "craft" -> container(player, "craft");
            default -> false;
        };
    }

    private boolean shop(Player player) {
        player.sendMessage(messages.get("shop.link", Map.of("url", plugin.config().siteUrl + "/shop")));

        boolean any = false;
        for (String feature : List.of("tp", "home", "back", "enderchest", "craft", "keepinv")) {
            ShopManager.Entry entry = plugin.shop().entry(player, feature);
            if (entry == null || !entry.usable()) continue;
            any = true;
            player.sendMessage(messages.get("shop.owned-line", Map.of(
                    "title", entry.title(),
                    "left", entry.permanent() ? "навсегда" : entry.chargesLeft() + " шт.")));
        }
        if (!any) player.sendMessage(messages.get("shop.empty"));
        return true;
    }

    /** Телепорт к игроку: заряд списывается только когда цель согласилась. */
    private boolean tpa(Player player, String[] args) {
        if (args.length < 1) {
            player.sendMessage(messages.get("shop.tpa-usage"));
            return true;
        }
        if (!plugin.shop().has(player, "tp")) {
            player.sendMessage(messages.get("shop.not-owned"));
            return true;
        }
        if (plugin.jail().isJailed(player)) {
            player.sendMessage(messages.get("shop.jailed"));
            return true;
        }

        Player target = Accounts.findOnline(args[0]);
        if (target == null || target.equals(player)) {
            player.sendMessage(messages.get("shop.no-target"));
            return true;
        }
        if (plugin.jail().isJailed(target)) {
            player.sendMessage(messages.get("shop.target-jailed"));
            return true;
        }

        requests.put(target.getUniqueId(), new Request(player.getUniqueId(), System.currentTimeMillis()));
        player.sendMessage(messages.get("shop.tpa-sent", Map.of("player", Accounts.name(target))));
        target.sendMessage(messages.get("shop.tpa-request", Map.of("player", Accounts.name(player))));
        return true;
    }

    private boolean answer(Player target, boolean accept) {
        Request request = requests.remove(target.getUniqueId());
        if (request == null || System.currentTimeMillis() - request.createdAt() > REQUEST_TTL_MS) {
            target.sendMessage(messages.get("shop.tpa-none"));
            return true;
        }

        Player from = plugin.getServer().getPlayer(request.from());
        if (from == null || !from.isOnline()) {
            target.sendMessage(messages.get("shop.tpa-gone"));
            return true;
        }
        if (!accept) {
            target.sendMessage(messages.get("shop.tpa-denied-you"));
            from.sendMessage(messages.get("shop.tpa-denied", Map.of("player", Accounts.name(target))));
            return true;
        }

        Location destination = target.getLocation();
        plugin.shop().use(from, "tp",
                left -> {
                    if (!from.isOnline() || !target.isOnline()) return;
                    from.teleport(destination);
                    from.sendMessage(messages.get("shop.tpa-done", Map.of(
                            "player", Accounts.name(target),
                            "left", String.valueOf(left))));
                    target.sendMessage(messages.get("shop.tpa-accepted", Map.of(
                            "player", Accounts.name(from))));
                },
                status -> from.sendMessage(messages.get("shop.use-failed")));
        return true;
    }

    private boolean setHome(Player player) {
        if (!plugin.shop().has(player, "home")) {
            player.sendMessage(messages.get("shop.not-owned"));
            return true;
        }
        if (plugin.jail().isJailed(player)) {
            player.sendMessage(messages.get("shop.jailed"));
            return true;
        }
        Location location = player.getLocation();
        plugin.shop().saveHome(player, location, () -> player.sendMessage(messages.get("shop.home-set")));
        return true;
    }

    private boolean home(Player player) {
        if (!plugin.shop().has(player, "home")) {
            player.sendMessage(messages.get("shop.not-owned"));
            return true;
        }
        if (plugin.jail().isJailed(player)) {
            player.sendMessage(messages.get("shop.jailed"));
            return true;
        }
        Location home = plugin.shop().home(player);
        if (home == null) {
            player.sendMessage(messages.get("shop.home-missing"));
            return true;
        }
        int cooldown = plugin.shop().cooldownLeft(player, "home");
        if (cooldown > 0) {
            player.sendMessage(messages.get("shop.cooldown", Map.of(
                    "minutes", String.valueOf(Math.max(1, cooldown / 60)))));
            return true;
        }

        // Дом постоянный: заряды не тратятся, но сайту важно время последнего входа.
        plugin.shop().use(player, "home",
                left -> {
                    player.teleport(home);
                    player.sendMessage(messages.get("shop.home-done"));
                },
                status -> player.sendMessage(messages.get("shop.use-failed")));
        return true;
    }

    private boolean back(Player player) {
        if (!plugin.shop().has(player, "back")) {
            player.sendMessage(messages.get("shop.not-owned"));
            return true;
        }
        Location point = plugin.shop().deathPoint(player);
        Long died = deathTimes.get(player.getUniqueId());
        if (point == null || died == null || System.currentTimeMillis() - died > BACK_TTL_MS) {
            player.sendMessage(messages.get("shop.back-missing"));
            return true;
        }
        if (plugin.jail().isJailed(player)) {
            player.sendMessage(messages.get("shop.jailed"));
            return true;
        }

        plugin.shop().use(player, "back",
                left -> {
                    player.teleport(point);
                    deathTimes.remove(player.getUniqueId());
                    player.sendMessage(messages.get("shop.back-done", Map.of("left", String.valueOf(left))));
                },
                status -> player.sendMessage(messages.get("shop.use-failed")));
        return true;
    }

    private boolean container(Player player, String feature) {
        if (!plugin.shop().has(player, feature)) {
            player.sendMessage(messages.get("shop.not-owned"));
            return true;
        }
        if (plugin.jail().isJailed(player)) {
            player.sendMessage(messages.get("shop.jailed"));
            return true;
        }

        plugin.shop().use(player, feature,
                left -> {
                    if (!player.isOnline()) return;
                    if ("enderchest".equals(feature)) {
                        player.openInventory(player.getEnderChest());
                    } else {
                        player.openWorkbench(null, true);
                    }
                    player.sendMessage(messages.get("shop.charges-left", Map.of("left", String.valueOf(left))));
                },
                status -> player.sendMessage(messages.get("shop.use-failed")));
        return true;
    }

    /** Время смерти помнит команда: по нему /back перестаёт работать через 15 минут. */
    public void rememberDeathTime(Player player) {
        deathTimes.put(player.getUniqueId(), System.currentTimeMillis());
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                      @NotNull String alias, String[] args) {
        if (!command.getName().equalsIgnoreCase("tpa") || args.length != 1) return List.of();
        List<String> names = new ArrayList<>();
        for (Player online : plugin.getServer().getOnlinePlayers()) {
            String name = Accounts.name(online);
            if (name.toLowerCase(Locale.ROOT).startsWith(args[0].toLowerCase(Locale.ROOT))) names.add(name);
        }
        return names;
    }
}
