package host.vanilla.core.admin;

import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.title.Title;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Команды администрации. Уровень проверяется по профилю с сайта, не по правам Bukkit. */
public final class StaffCommands implements CommandExecutor, TabCompleter {

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    public StaffCommands(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, String[] args) {
        if (!(sender instanceof Player admin)) {
            sender.sendMessage("Команда доступна только в игре");
            return true;
        }
        int level = plugin.auth().adminLevel(admin);

        return switch (command.getName().toLowerCase(Locale.ROOT)) {
            case "spec" -> spec(admin, level);
            case "esp" -> esp(admin, level);
            case "ajail" -> ajail(admin, level, args);
            case "unjail" -> unjail(admin, level, args);
            case "warn" -> warn(admin, level, args);
            case "ban" -> ban(admin, level, args);
            case "check" -> check(admin, level, args);
            case "asms" -> asms(admin, level, args);
            case "news" -> news(admin, level, args);
            case "reports" -> reports(admin, level);
            case "spark" -> spark(admin, level);
            case "tp" -> teleport(admin, level, args, false);
            case "tphere" -> teleport(admin, level, args, true);
            case "a" -> staffChat(admin, level, args);
            case "chide" -> hide(admin, level);
            default -> false;
        };
    }

    /** Зажечь искру рядом с собой — для проверки настроек события. */
    private boolean spark(Player admin, int level) {
        if (denied(admin, level, 5)) return true;
        boolean ok = plugin.sparks().spawnNear(admin);
        admin.sendMessage(messages.get(ok ? "spark.forced" : "spark.no-place"));
        return true;
    }

    private boolean denied(Player admin, int level, int required) {
        if (level >= required) return false;
        admin.sendMessage(messages.get("staff.no-access"));
        return true;
    }

    private boolean spec(Player admin, int level) {
        if (denied(admin, level, 1)) return true;
        boolean toSpectator = admin.getGameMode() != GameMode.SPECTATOR;
        admin.setGameMode(toSpectator ? GameMode.SPECTATOR : GameMode.SURVIVAL);
        admin.sendMessage(messages.get(toSpectator ? "staff.spec-on" : "staff.spec-off"));
        return true;
    }

    private boolean esp(Player admin, int level) {
        if (denied(admin, level, 2)) return true;
        boolean enabled = plugin.esp().toggle(admin);
        admin.sendMessage(messages.get(enabled ? "staff.esp-on" : "staff.esp-off"));
        plugin.logAdminAction(admin, "esp.toggle", null, Map.of("enabled", enabled));
        return true;
    }

    private boolean ajail(Player admin, int level, String[] args) {
        if (denied(admin, level, 2)) return true;
        if (args.length < 3) {
            admin.sendMessage(messages.get("staff.usage-ajail"));
            return true;
        }
        int minutes;
        try {
            minutes = Integer.parseInt(args[args.length - 1]);
        } catch (NumberFormatException e) {
            admin.sendMessage(messages.get("staff.usage-ajail"));
            return true;
        }
        String target = Accounts.name(args[0]);
        String reason = String.join(" ", Arrays.copyOfRange(args, 1, args.length - 1));

        Map<String, Object> body = new HashMap<>();
        body.put("type", "JAIL");
        body.put("targetLogin", target);
        body.put("actorLogin", Accounts.name(admin));
        body.put("reason", reason);
        body.put("minutes", minutes);

        plugin.api().onMain(plugin.api().post("/api/mc/punish", body), response -> {
            if (!ok(admin, response)) return;
            JsonObject punishment = response.getAsJsonObject("punishment");
            Player targetPlayer = Accounts.findOnline(target);
            if (targetPlayer != null) {
                plugin.jail().apply(targetPlayer, punishment.get("id").getAsString(), reason,
                        punishment.get("totalSeconds").getAsInt());
            }
            admin.sendMessage(messages.get("staff.jailed", Map.of(
                    "player", target, "minutes", String.valueOf(minutes))));
        });
        return true;
    }

    /** Досрочный выпуск из деморгана. Доступен с хелпера, как и сам /ajail. */
    private boolean unjail(Player admin, int level, String[] args) {
        if (denied(admin, level, 2)) return true;
        if (args.length < 1) {
            admin.sendMessage(messages.get("staff.usage-unjail"));
            return true;
        }
        String target = Accounts.name(args[0]);

        plugin.api().onMain(plugin.api().post("/api/mc/unjail", Map.of(
                "targetLogin", target,
                "actorLogin", Accounts.name(admin))), response -> {
            if (!ok(admin, response)) return;

            // Игрока в сети выпускаем сразу: инвентарь и точку возврата знает плагин.
            Player targetPlayer = Accounts.findOnline(target);
            if (targetPlayer != null) plugin.jail().release(targetPlayer, true);

            admin.sendMessage(messages.get("staff.unjailed", Map.of("player", target)));
            plugin.logAdminAction(admin, "unjail", target, Map.of());
        });
        return true;
    }

    private boolean warn(Player admin, int level, String[] args) {
        if (denied(admin, level, 3)) return true;
        if (args.length < 2) {
            admin.sendMessage(messages.get("staff.usage-warn"));
            return true;
        }
        String target = Accounts.name(args[0]);
        String reason = String.join(" ", Arrays.copyOfRange(args, 1, args.length));

        plugin.api().onMain(plugin.api().post("/api/mc/punish", Map.of(
                "type", "WARN",
                "targetLogin", target,
                "actorLogin", Accounts.name(admin),
                "reason", reason)), response -> {
            if (!ok(admin, response)) return;
            boolean autoBan = response.has("autoBan") && !response.get("autoBan").isJsonNull();
            admin.sendMessage(messages.get("staff.warned", Map.of("player", target)));
            Player targetPlayer = Accounts.findOnline(target);
            if (targetPlayer != null) {
                targetPlayer.sendMessage(messages.get("punish.warn", Map.of("reason", reason)));
                if (autoBan) {
                    targetPlayer.kick(messages.plain("punish.auto-ban", Map.of("reason", reason)));
                }
            }
            if (autoBan) admin.sendMessage(messages.get("staff.auto-ban", Map.of("player", target)));
        });
        return true;
    }

    private boolean ban(Player admin, int level, String[] args) {
        if (denied(admin, level, 3)) return true;
        if (args.length < 3) {
            admin.sendMessage(messages.get("staff.usage-ban"));
            return true;
        }
        int days;
        try {
            days = Integer.parseInt(args[args.length - 1]);
        } catch (NumberFormatException e) {
            admin.sendMessage(messages.get("staff.usage-ban"));
            return true;
        }
        String target = Accounts.name(args[0]);
        String reason = String.join(" ", Arrays.copyOfRange(args, 1, args.length - 1));

        Map<String, Object> body = new HashMap<>();
        body.put("type", "BAN");
        body.put("targetLogin", target);
        body.put("actorLogin", Accounts.name(admin));
        body.put("reason", reason);
        body.put("days", days);

        plugin.api().onMain(plugin.api().post("/api/mc/punish", body), response -> {
            if (!ok(admin, response)) return;
            admin.sendMessage(messages.get("staff.banned", Map.of(
                    "player", target, "days", String.valueOf(days))));
            Player targetPlayer = Accounts.findOnline(target);
            if (targetPlayer != null) {
                targetPlayer.kick(messages.plain("punish.banned", Map.of(
                        "reason", reason, "days", String.valueOf(days))));
            }
        });
        return true;
    }

    private boolean check(Player admin, int level, String[] args) {
        if (denied(admin, level, 3)) return true;
        if (args.length < 2) {
            admin.sendMessage(messages.get("staff.usage-check"));
            return true;
        }
        Player target = Accounts.findOnline(args[0]);
        if (target == null) {
            admin.sendMessage(messages.get("staff.no-player"));
            return true;
        }
        String argument = args[1].toLowerCase(Locale.ROOT);
        if (argument.equals("pass") || argument.equals("fail")) {
            plugin.checks().finish(target, admin, argument.equals("pass"));
            return true;
        }
        plugin.checks().start(admin, target, args[1]);
        return true;
    }

    private boolean asms(Player admin, int level, String[] args) {
        if (denied(admin, level, 2)) return true;
        if (args.length < 2) {
            admin.sendMessage(messages.get("staff.usage-asms"));
            return true;
        }
        Player target = Accounts.findOnline(args[0]);
        if (target == null) {
            admin.sendMessage(messages.get("staff.no-player"));
            return true;
        }
        String text = String.join(" ", Arrays.copyOfRange(args, 1, args.length));
        target.sendMessage(messages.get("staff.asms", Map.of("text", text)));
        admin.sendMessage(messages.get("staff.asms-sent", Map.of("player", target.getName())));
        plugin.logAdminAction(admin, "asms", Accounts.name(target), Map.of("text", text));
        return true;
    }

    private boolean news(Player admin, int level, String[] args) {
        if (denied(admin, level, 5)) return true;
        if (args.length == 0) {
            admin.sendMessage(messages.get("staff.usage-news"));
            return true;
        }
        String text = String.join(" ", args);
        Component message = messages.get("staff.news", Map.of("text", text));
        for (Player player : Bukkit.getOnlinePlayers()) {
            player.sendMessage(message);
            player.showTitle(Title.title(
                    Component.text("Новость", NamedTextColor.GOLD),
                    Component.text(text, NamedTextColor.WHITE),
                    Title.Times.times(Duration.ofMillis(300), Duration.ofSeconds(5), Duration.ofMillis(500))));
        }
        plugin.logAdminAction(admin, "news", null, Map.of("text", text));
        return true;
    }

    private boolean reports(Player admin, int level) {
        if (denied(admin, level, 2)) return true;
        plugin.reports().openMenu(admin);
        return true;
    }

    private boolean teleport(Player admin, int level, String[] args, boolean bringHere) {
        if (denied(admin, level, 2)) return true;
        if (args.length < 1) {
            admin.sendMessage(messages.get("staff.usage-tp"));
            return true;
        }
        Player target = Accounts.findOnline(args[0]);
        if (target == null) {
            admin.sendMessage(messages.get("staff.no-player"));
            return true;
        }
        if (bringHere) {
            target.teleport(admin.getLocation());
            admin.sendMessage(messages.get("staff.tphere", Map.of("player", target.getName())));
        } else {
            admin.teleport(target.getLocation());
            admin.sendMessage(messages.get("staff.tp", Map.of("player", target.getName())));
        }
        plugin.logAdminAction(admin, bringHere ? "tphere" : "tp", Accounts.name(target), Map.of());
        return true;
    }

    /** Закрытый чат администрации: видят только те, у кого хватает уровня. */
    private boolean staffChat(Player admin, int level, String[] args) {
        if (denied(admin, level, StaffChat.LEVEL)) return true;
        if (args.length == 0) {
            admin.sendMessage(messages.get("staff.usage-a"));
            return true;
        }
        String text = String.join(" ", args);
        Component line = messages.plain("staff.chat", Map.of(
                "player", admin.getName(), "text", text));

        int seen = 0;
        for (Player viewer : Bukkit.getOnlinePlayers()) {
            if (plugin.auth().adminLevel(viewer) < StaffChat.LEVEL) continue;
            viewer.sendMessage(line);
            seen++;
        }
        plugin.getServer().getConsoleSender().sendMessage(line);
        if (seen <= 1) admin.sendMessage(messages.get("staff.chat-alone"));
        return true;
    }

    /** Полная невидимость — /chide. */
    private boolean hide(Player admin, int level) {
        if (denied(admin, level, VanishManager.LEVEL)) return true;
        boolean vanished = plugin.vanish().toggle(admin);
        admin.sendMessage(messages.get(vanished ? "staff.hide-on" : "staff.hide-off"));
        plugin.logAdminAction(admin, "vanish.toggle", null, Map.of("hidden", vanished));
        return true;
    }

    /** Уровень доступа к /a. Держим рядом с командой, чтобы не искать по конфигу. */
    private static final class StaffChat {
        static final int LEVEL = 2;
    }

    /** Коды сайта — служебные. В чат идёт понятный текст, а не «already_jailed». */
    private static final Map<String, String> ERRORS = Map.of(
            "target_not_found", "такого игрока нет на сайте",
            "already_jailed", "игрок уже в деморгане",
            "not_jailed", "игрок не в деморгане",
            "forbidden", "недостаточно прав",
            "unauthorized", "сервер не авторизован на сайте",
            "bad request", "команда заполнена не полностью");

    private boolean ok(Player admin, JsonObject response) {
        int status = response.get("_status").getAsInt();
        if (status == 200) return true;

        String code = response.has("error") ? response.get("error").getAsString() : "";
        String message = response.has("message") && !response.get("message").isJsonNull()
                ? response.get("message").getAsString()
                : ERRORS.getOrDefault(code, code.isBlank() ? "сайт не ответил" : code);
        admin.sendMessage(messages.get("staff.error", Map.of("error", message)));
        return false;
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                      @NotNull String alias, String[] args) {
        if (args.length != 1) return List.of();
        List<String> names = new ArrayList<>();
        Bukkit.getOnlinePlayers().forEach(player -> names.add(player.getName()));
        String prefix = args[0].toLowerCase(Locale.ROOT);
        return names.stream().filter(name -> name.toLowerCase(Locale.ROOT).startsWith(prefix)).toList();
    }
}
