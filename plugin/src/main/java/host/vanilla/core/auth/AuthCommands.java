package host.vanilla.core.auth;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import host.vanilla.core.util.Messages;

/** /login и /2fa. */
public final class AuthCommands implements CommandExecutor {

    private final AuthManager auth;
    private final Messages messages;

    public AuthCommands(AuthManager auth, Messages messages) {
        this.auth = auth;
        this.messages = messages;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Только для игроков");
            return true;
        }
        if (args.length < 1) {
            player.sendMessage(messages.get(command.getName().equals("2fa") ? "auth.usage-2fa" : "auth.usage-login"));
            return true;
        }
        if (command.getName().equalsIgnoreCase("2fa")) {
            auth.twoFactor(player, args[0]);
        } else {
            auth.login(player, args[0]);
        }
        return true;
    }
}
