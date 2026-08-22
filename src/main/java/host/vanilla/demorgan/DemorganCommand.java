package host.vanilla.demorgan;

import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/** /demorgan и /unmorgan. */
public final class DemorganCommand implements CommandExecutor, TabCompleter {

    private final DemorganPlugin plugin;
    private final PunishmentManager manager;
    private final Messages messages;

    public DemorganCommand(DemorganPlugin plugin, PunishmentManager manager, Messages messages) {
        this.plugin = plugin;
        this.manager = manager;
        this.messages = messages;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, String[] args) {
        if (command.getName().equalsIgnoreCase("unmorgan")) {
            return handleRelease(sender, args);
        }
        if (args.length == 0) {
            usage(sender);
            return true;
        }
        return switch (args[0].toLowerCase(Locale.ROOT)) {
            case "check" -> handleCheck(sender, args);
            case "list" -> handleList(sender);
            case "reload" -> handleReload(sender);
            default -> handleJail(sender, args);
        };
    }

    private boolean handleJail(CommandSender sender, String[] args) {
        if (!sender.hasPermission("demorgan.admin")) {
            sender.sendMessage(Component.text("Недостаточно прав."));
            return true;
        }
        if (args.length < 3) {
            usage(sender);
            return true;
        }
        OfflinePlayer target = resolve(args[0]);
        if (target == null || target.getUniqueId() == null) {
            sender.sendMessage(messages.get("not-jailed", Map.of("player", args[0])));
            return true;
        }
        UUID uuid = target.getUniqueId();
        String name = target.getName() != null ? target.getName() : args[0];

        Player online = Bukkit.getPlayer(uuid);
        if (online != null && online.hasPermission("demorgan.exempt")) {
            sender.sendMessage(messages.get("exempt", Map.of("player", name)));
            return true;
        }
        if (manager.isJailed(uuid)) {
            sender.sendMessage(messages.get("already-jailed", Map.of("player", name)));
            return true;
        }

        int minutes;
        if (args[1].equalsIgnoreCase("auto")) {
            minutes = plugin.config().escalatedMinutes(manager.offences(uuid));
        } else {
            try {
                minutes = Integer.parseInt(args[1]);
            } catch (NumberFormatException e) {
                sender.sendMessage(Component.text("Срок должен быть числом минут или 'auto'."));
                return true;
            }
        }
        if (minutes < 1 || minutes > plugin.config().maxMinutes) {
            sender.sendMessage(Component.text("Срок должен быть от 1 до "
                    + plugin.config().maxMinutes + " минут."));
            return true;
        }

        String reason = String.join(" ", Arrays.copyOfRange(args, 2, args.length));
        manager.jail(uuid, name, online, minutes, reason, sender.getName());
        return true;
    }

    private boolean handleRelease(CommandSender sender, String[] args) {
        if (!sender.hasPermission("demorgan.admin")) {
            sender.sendMessage(Component.text("Недостаточно прав."));
            return true;
        }
        if (args.length < 1) {
            sender.sendMessage(Component.text("Использование: /unmorgan <ник>"));
            return true;
        }
        OfflinePlayer target = resolve(args[0]);
        if (target == null || !manager.isJailed(target.getUniqueId())) {
            sender.sendMessage(messages.get("not-jailed", Map.of("player", args[0])));
            return true;
        }
        manager.release(target.getUniqueId(), true, sender.getName());
        sender.sendMessage(messages.get("released-early"));
        return true;
    }

    private boolean handleCheck(CommandSender sender, String[] args) {
        if (!sender.hasPermission("demorgan.check")) {
            sender.sendMessage(Component.text("Недостаточно прав."));
            return true;
        }
        if (args.length < 2) {
            sender.sendMessage(Component.text("Использование: /demorgan check <ник>"));
            return true;
        }
        OfflinePlayer target = resolve(args[1]);
        if (target == null) {
            sender.sendMessage(messages.get("not-jailed", Map.of("player", args[1])));
            return true;
        }
        UUID uuid = target.getUniqueId();
        String name = target.getName() != null ? target.getName() : args[1];
        manager.get(uuid).ifPresentOrElse(
                p -> sender.sendMessage(messages.get("check", Map.of(
                        "player", name,
                        "time", Messages.formatTime(p.remainingSeconds()),
                        "blocks", String.valueOf(p.blocksMined()),
                        "reason", p.reason()))),
                () -> sender.sendMessage(messages.get("not-jailed", Map.of("player", name))));
        sender.sendMessage(messages.get("history", Map.of(
                "player", name,
                "count", String.valueOf(manager.offences(uuid)))));
        return true;
    }

    private boolean handleList(CommandSender sender) {
        if (!sender.hasPermission("demorgan.check")) {
            sender.sendMessage(Component.text("Недостаточно прав."));
            return true;
        }
        Map<UUID, Punishment> active = manager.active();
        if (active.isEmpty()) {
            sender.sendMessage(Component.text("В деморгане никого нет."));
            return true;
        }
        active.values().forEach(p -> sender.sendMessage(messages.get("check", Map.of(
                "player", p.name(),
                "time", Messages.formatTime(p.remainingSeconds()),
                "blocks", String.valueOf(p.blocksMined()),
                "reason", p.reason()))));
        return true;
    }

    private boolean handleReload(CommandSender sender) {
        if (!sender.hasPermission("demorgan.admin")) {
            sender.sendMessage(Component.text("Недостаточно прав."));
            return true;
        }
        plugin.reloadPluginConfig();
        sender.sendMessage(Component.text("Конфиг перезагружен."));
        return true;
    }

    private void usage(CommandSender sender) {
        sender.sendMessage(Component.text("/demorgan <ник> <минуты|auto> <причина>"));
        sender.sendMessage(Component.text("/demorgan check <ник> | /demorgan list | /demorgan reload"));
        sender.sendMessage(Component.text("/unmorgan <ник>"));
    }

    /** Онлайн — сразу; иначе только тот, кто уже заходил (без блокирующего запроса к Mojang). */
    private OfflinePlayer resolve(String name) {
        Player online = Bukkit.getPlayerExact(name);
        return online != null ? online : Bukkit.getOfflinePlayerIfCached(name);
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                      @NotNull String alias, String[] args) {
        List<String> out = new ArrayList<>();
        if (command.getName().equalsIgnoreCase("unmorgan")) {
            if (args.length == 1) {
                manager.active().values().forEach(p -> out.add(p.name()));
            }
            return filter(out, args[args.length - 1]);
        }
        if (args.length == 1) {
            out.addAll(List.of("check", "list", "reload"));
            Bukkit.getOnlinePlayers().forEach(p -> out.add(p.getName()));
        } else if (args.length == 2) {
            if (args[0].equalsIgnoreCase("check")) {
                Bukkit.getOnlinePlayers().forEach(p -> out.add(p.getName()));
            } else {
                out.addAll(List.of("auto", "30", "120", "360"));
            }
        }
        return filter(out, args[args.length - 1]);
    }

    private static List<String> filter(List<String> options, String prefix) {
        String lower = prefix.toLowerCase(Locale.ROOT);
        return options.stream().filter(s -> s.toLowerCase(Locale.ROOT).startsWith(lower)).toList();
    }
}
