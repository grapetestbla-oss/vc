package host.vanilla.core.season;

import host.vanilla.core.VanillaCorePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.entity.Player;

import java.util.Map;

/**
 * Шапка и подвал списка игроков: сезон, онлайн и TPS. Обновляется раз в
 * несколько секунд — чаще незачем, TPS всё равно усредняется сервером.
 */
public final class TabList {

    private final VanillaCorePlugin plugin;

    public TabList(VanillaCorePlugin plugin) {
        this.plugin = plugin;
    }

    public void refresh() {
        double tps = Math.min(20.0, plugin.getServer().getTPS()[0]);
        double mspt = plugin.getServer().getAverageTickTime();
        int online = plugin.getServer().getOnlinePlayers().size();

        String tpsColor = tps >= 18.5 ? "<green>" : tps >= 15 ? "<yellow>" : "<red>";
        String season = plugin.config().seasonName;

        Component header = MiniMessage.miniMessage().deserialize(String.join("<newline>",
                "",
                "<gradient:#f5c451:#ffe9a8><bold>VanillaCraft</bold></gradient> <dark_gray>|</dark_gray> <gold>" + season + "</gold>",
                "<gray>ванилла без приватов</gray>",
                ""));

        for (Player player : plugin.getServer().getOnlinePlayers()) {
            Component footer = MiniMessage.miniMessage().deserialize(String.join("<newline>",
                    "",
                    "<gray>TPS</gray> " + tpsColor + String.format("%.2f", tps) + "</gray>"
                            + " <dark_gray>·</dark_gray> <gray>тик</gray> <white>" + String.format("%.1f", mspt) + " мс</white>"
                            + " <dark_gray>·</dark_gray> <gray>онлайн</gray> <white>" + online + "</white>"
                            + " <dark_gray>·</dark_gray> <gray>пинг</gray> <white>" + player.getPing() + " мс</white>",
                    "<gray>баланс</gray> <gold>" + plugin.auth().profile(player).balanceVc() + " VC</gold>"
                            + " <dark_gray>·</dark_gray> <gray>уровень</gray> <white>" + plugin.auth().profile(player).level() + "</white>",
                    "<yellow>" + plugin.config().siteUrl.replaceFirst("^https?://", "") + "</yellow>",
                    ""));

            player.sendPlayerListHeaderAndFooter(header, footer);
        }
    }

    /** Табличка при заходе — тот же сезон, чтобы новичок сразу видел, куда попал. */
    public void welcome(Player player) {
        player.sendMessage(plugin.messages().get("season.welcome",
                Map.of("season", plugin.config().seasonName)));
    }
}
