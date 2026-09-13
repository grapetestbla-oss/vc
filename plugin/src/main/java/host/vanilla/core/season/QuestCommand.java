package host.vanilla.core.season;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

/**
 * `/event` — меню осеннего ивента, `/event сдать` — сдать предметы по заданию.
 *
 * Отдельной командой на каждое задание обходиться не стали: заданий семь, и
 * запоминать семь слов игроку незачем — сдаётся всё, что подходит открытым
 * заданиям, одним разом.
 */
public final class QuestCommand implements CommandExecutor {

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    public QuestCommand(VanillaCorePlugin plugin, Messages messages) {
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

        if (args.length > 0 && (args[0].equalsIgnoreCase("сдать") || args[0].equalsIgnoreCase("deliver"))) {
            plugin.quests().deliver(player);
            return true;
        }

        plugin.quests().open(player);
        return true;
    }
}
