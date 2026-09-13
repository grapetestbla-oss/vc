package host.vanilla.core.admin;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.util.Map;

/**
 * Мост к стороннему античиту.
 *
 * Античит настраивается на вызов консольной команды при нарушении, команда
 * заводит сработку на сайте и будит администрацию в Telegram.
 *
 * Через команду, а не через API конкретного античита, намеренно: у каждого он
 * свой, а запускать команду при сработке умеют все. Замена античита потребует
 * правки одной строки в его конфиге, а не переписывания плагина.
 *
 * Пример для конфига античита:
 *   alert-command: "vcflag %player% %check% %violations%"
 */
public final class CheatBridge implements CommandExecutor {

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    public CheatBridge(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, String[] args) {
        // Только консоль и пятый уровень: иначе сработки мог бы подделать любой,
        // кому дали доступ к командам.
        boolean allowed = sender instanceof ConsoleCommandSender
                || (sender instanceof Player player && plugin.auth().adminLevel(player) >= 5);
        if (!allowed) {
            sender.sendMessage(messages.get("staff.no-access"));
            return true;
        }

        if (args.length < 1) {
            sender.sendMessage("Использование: /vcflag <ник> [проверка] [уровень]");
            return true;
        }

        String login = args[0];
        String check = args.length > 1 ? args[1] : "?";
        int level = 1;
        if (args.length > 2) {
            try {
                // Античиты пишут уровень по-разному: «12», «12.4», «vl:12».
                level = (int) Double.parseDouble(args[2].replaceAll("[^0-9.]", ""));
            } catch (NumberFormatException ignored) {
                // Не разобрали — значит единица: важен сам факт сработки.
            }
        }

        Player target = plugin.getServer().getPlayerExact(login);
        String account = target != null ? Accounts.name(target) : login;

        plugin.api().post("/api/mc/cheat", Map.of(
                "login", account,
                "check", check,
                "level", level,
                "raw", String.join(" ", args)));

        plugin.getLogger().warning("Античит: " + account + " — " + check + " (уровень " + level + ")");
        return true;
    }
}
