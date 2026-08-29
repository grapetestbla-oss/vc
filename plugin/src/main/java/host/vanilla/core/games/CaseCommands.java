package host.vanilla.core.games;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.util.Locale;

/** Игровые команды кейсов и костей: /cases, /cubes. */
public final class CaseCommands implements CommandExecutor {

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    public CaseCommands(VanillaCorePlugin plugin, Messages messages) {
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
            case "cases" -> cases(player, args);
            case "cubes" -> cubes(player, args);
            default -> false;
        };
    }

    private boolean cases(Player player, String[] args) {
        if (args.length == 0) {
            plugin.cases().openShop(player);
            return true;
        }

        String first = args[0].toLowerCase(Locale.ROOT);
        // Открыть уже купленный кейс, не трогая предмет: клик мог перехватить
        // другой плагин, а кейс оплачен и должен открываться при любом раскладе.
        if (first.equals("open") || first.equals("открыть")) {
            String key = args.length > 1 ? args[1].toLowerCase(Locale.ROOT) : null;
            if (!plugin.caseOpening().openFromInventory(player, key)) {
                player.sendMessage(messages.get("cases.none"));
            }
            return true;
        }

        plugin.cases().buy(player, first);
        return true;
    }

    private boolean cubes(Player player, String[] args) {
        if (args.length == 0) {
            player.sendMessage(messages.get("dice.usage"));
            return true;
        }

        String first = args[0].toLowerCase(Locale.ROOT);
        if (first.equals("accept") || first.equals("да")) {
            plugin.dice().accept(player);
            return true;
        }
        if (first.equals("deny") || first.equals("нет")) {
            plugin.dice().deny(player);
            return true;
        }

        try {
            plugin.dice().challenge(player, Integer.parseInt(first));
        } catch (NumberFormatException e) {
            player.sendMessage(messages.get("dice.usage"));
        }
        return true;
    }
}
