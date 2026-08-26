package host.vanilla.core.economy;

import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.auth.Profile;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.util.Locale;
import java.util.Map;

/** Команды игрока: /balance, /promo, /bonus, /report. */
public final class PlayerCommands implements CommandExecutor {

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    public PlayerCommands(VanillaCorePlugin plugin, Messages messages) {
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

        return switch (command.getName().toLowerCase(Locale.ROOT)) {
            case "balance" -> balance(player);
            case "promo" -> code(player, args, "/api/mc/promo", "promo");
            case "bonus" -> code(player, args, "/api/mc/bonus", "bonus");
            case "report" -> report(player, args);
            case "giveaway" -> giveaway(player);
            default -> false;
        };
    }

    private boolean balance(Player player) {
        plugin.api().onMain(
                plugin.api().get("/api/mc/profile?login=" + Accounts.name(player)),
                response -> {
                    if (response.get("_status").getAsInt() != 200) {
                        player.sendMessage(messages.get("economy.api-down"));
                        return;
                    }
                    Profile profile = plugin.auth().profile(player);
                    profile.setBalanceVc(response.get("balanceVc").getAsInt());
                    profile.setLevel(response.get("level").getAsInt());
                    player.sendMessage(messages.get("economy.balance", Map.of(
                            "balance", String.valueOf(profile.balanceVc()),
                            "level", String.valueOf(profile.level()))));
                });
        return true;
    }

    private boolean code(Player player, String[] args, String endpoint, String kind) {
        if (args.length < 1) {
            player.sendMessage(messages.get("economy.usage-" + kind));
            return true;
        }
        plugin.api().onMain(
                plugin.api().post(endpoint, Map.of("login", Accounts.name(player), "code", args[0])),
                response -> handleCode(player, response));
        return true;
    }

    private void handleCode(Player player, JsonObject response) {
        String status = response.has("status") ? response.get("status").getAsString() : "error";
        switch (status) {
            case "ok" -> {
                int reward = response.get("reward").getAsInt();
                int balance = response.get("balance").getAsInt();
                plugin.auth().profile(player).setBalanceVc(balance);
                player.sendMessage(messages.get("economy.code-ok", Map.of(
                        "reward", String.valueOf(reward),
                        "balance", String.valueOf(balance))));
            }
            case "level_too_low" -> player.sendMessage(messages.get("economy.code-level", Map.of(
                    "required", response.get("required").getAsString(),
                    "level", response.get("level").getAsString())));
            case "already_used" -> player.sendMessage(messages.get("economy.code-used"));
            case "not_found" -> player.sendMessage(messages.get("economy.code-bad"));
            case "expired" -> player.sendMessage(messages.get("economy.code-expired"));
            case "exhausted" -> player.sendMessage(messages.get("economy.code-exhausted"));
            case "rate_limited" -> player.sendMessage(messages.get("economy.code-slow"));
            default -> player.sendMessage(messages.get("economy.api-down"));
        }
    }

    /** Плашка о розыгрышах по требованию: что разыгрывают и сколько наиграно. */
    private boolean giveaway(Player player) {
        plugin.giveaways().show(player, true);
        return true;
    }

    private boolean report(Player player, String[] args) {
        if (args.length < 2) {
            player.sendMessage(messages.get("report.usage"));
            return true;
        }
        plugin.reports().create(player, String.join(" ", args));
        return true;
    }
}
