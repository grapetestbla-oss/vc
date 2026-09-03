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
    /** Имя точки, если игрок его не назвал: у большинства дом всё равно один. */
    public static final String DEFAULT_HOME = "дом";

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
            case "sethome" -> setHome(player, args);
            case "home" -> home(player, args);
            case "homes" -> homes(player);
            case "delhome" -> delHome(player, args);
            case "back" -> back(player);
            case "ec" -> container(player, "enderchest");
            case "craft" -> container(player, "craft");
            default -> false;
        };
    }

    /**
     * Список покупок всегда перечитываем с сайта: кэш набирается при входе, и
     * без этого купленное только что не показывалось до перезахода.
     */
    private boolean shop(Player player) {
        player.sendMessage(messages.get("shop.link", Map.of("url", plugin.config().siteUrl + "/shop")));
        plugin.shop().refresh(player, () -> {
            if (player.isOnline()) showOwned(player);
        });
        return true;
    }

    private void showOwned(Player player) {
        boolean any = false;
        for (String feature : ShopManager.FEATURES) {
            ShopManager.Entry entry = plugin.shop().entry(player, feature);
            if (entry == null || !entry.usable()) continue;
            any = true;
            player.sendMessage(messages.get("shop.owned-line", Map.of(
                    "title", entry.title(),
                    "left", entry.permanent() ? "навсегда" : entry.chargesLeft() + " шт.")));
        }
        if (!any) player.sendMessage(messages.get("shop.empty"));
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

    private boolean setHome(Player player, String[] args) {
        if (!plugin.shop().has(player, "home")) {
            player.sendMessage(messages.get("shop.not-owned"));
            return true;
        }
        if (plugin.jail().isJailed(player)) {
            player.sendMessage(messages.get("shop.jailed"));
            return true;
        }
        String name = args.length > 0 ? args[0] : DEFAULT_HOME;
        Location location = player.getLocation();
        plugin.homes().save(player, name, location, error -> {
            if (error != null) {
                player.sendMessage(messages.get("shop.home-denied", Map.of("reason", error)));
                return;
            }
            HomesManager.Capacity capacity = plugin.homes().capacity(player);
            player.sendMessage(messages.get("shop.home-set", Map.of(
                    "name", name.toLowerCase(Locale.ROOT),
                    "used", capacity == null ? "?" : String.valueOf(capacity.used()),
                    "total", capacity == null ? "?" : String.valueOf(capacity.total()))));
        });
        return true;
    }

    private boolean home(Player player, String[] args) {
        if (!plugin.shop().has(player, "home")) {
            player.sendMessage(messages.get("shop.not-owned"));
            return true;
        }
        if (plugin.jail().isJailed(player)) {
            player.sendMessage(messages.get("shop.jailed"));
            return true;
        }
        int cooldown = plugin.shop().cooldownLeft(player, "home");
        if (cooldown > 0) {
            player.sendMessage(messages.get("shop.cooldown", Map.of(
                    "minutes", String.valueOf(Math.max(1, cooldown / 60)))));
            return true;
        }

        String name = args.length > 0 ? args[0] : null;
        // Дома перечитываем перед прыжком: точку могли докупить или удалить с
        // сайта, а кэш набирается при входе.
        plugin.homes().refresh(player, () -> {
            if (!player.isOnline()) return;
            HomesManager.Home home = plugin.homes().find(player, name);
            if (home == null) {
                player.sendMessage(messages.get(
                        plugin.homes().list(player).isEmpty() ? "shop.home-missing" : "shop.home-unknown"));
                if (!plugin.homes().list(player).isEmpty()) showHomes(player);
                return;
            }

            // Дом постоянный: заряды не тратятся, но сайту важно время последнего входа.
            plugin.shop().use(player, "home",
                    left -> {
                        player.teleport(home.location());
                        player.sendMessage(messages.get("shop.home-done", Map.of("name", home.name())));
                    },
                    status -> player.sendMessage(messages.get("shop.use-failed")));
        });
        return true;
    }

    private boolean homes(Player player) {
        if (!plugin.shop().has(player, "home")) {
            player.sendMessage(messages.get("shop.not-owned"));
            return true;
        }
        plugin.homes().refresh(player, () -> {
            if (player.isOnline()) showHomes(player);
        });
        return true;
    }

    private void showHomes(Player player) {
        HomesManager.Capacity capacity = plugin.homes().capacity(player);
        player.sendMessage(messages.get("shop.homes-header", Map.of(
                "used", capacity == null ? "?" : String.valueOf(capacity.used()),
                "total", capacity == null ? "?" : String.valueOf(capacity.total()))));
        for (HomesManager.Home home : plugin.homes().list(player)) {
            Location at = home.location();
            player.sendMessage(messages.get("shop.homes-line", Map.of(
                    "name", home.name(),
                    "x", String.valueOf(at.getBlockX()),
                    "y", String.valueOf(at.getBlockY()),
                    "z", String.valueOf(at.getBlockZ()))));
        }
        if (plugin.homes().list(player).isEmpty()) {
            player.sendMessage(messages.get("shop.home-missing"));
        }
        if (capacity != null && capacity.nextPrice() != null) {
            player.sendMessage(messages.get("shop.homes-buy", Map.of(
                    "price", String.valueOf(capacity.nextPrice()),
                    "url", plugin.config().siteUrl + "/shop")));
        } else if (capacity != null && capacity.nextLevel() != null) {
            player.sendMessage(messages.get("shop.homes-locked", Map.of(
                    "level", String.valueOf(capacity.nextLevel()))));
        }
    }

    private boolean delHome(Player player, String[] args) {
        if (args.length < 1) {
            player.sendMessage(messages.get("shop.delhome-usage"));
            return true;
        }
        plugin.homes().delete(player, args[0], error -> {
            if (error != null) {
                player.sendMessage(messages.get("shop.home-denied", Map.of("reason", error)));
                return;
            }
            player.sendMessage(messages.get("shop.home-deleted", Map.of(
                    "name", args[0].toLowerCase(Locale.ROOT))));
        });
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
        if (args.length != 1) return List.of();
        String prefix = args[0].toLowerCase(Locale.ROOT);

        // У домов подсказка нужнее, чем у остальных команд: имя игрок придумал сам.
        if (sender instanceof Player player
                && (command.getName().equalsIgnoreCase("home")
                || command.getName().equalsIgnoreCase("delhome"))) {
            List<String> names = new ArrayList<>();
            for (HomesManager.Home home : plugin.homes().list(player)) {
                if (home.name().startsWith(prefix)) names.add(home.name());
            }
            return names;
        }

        if (!command.getName().equalsIgnoreCase("tpa")) return List.of();
        List<String> names = new ArrayList<>();
        for (Player online : plugin.getServer().getOnlinePlayers()) {
            String name = Accounts.name(online);
            if (name.toLowerCase(Locale.ROOT).startsWith(prefix)) names.add(name);
        }
        return names;
    }
}
