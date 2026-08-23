package host.vanilla.core.cosmetics;

import host.vanilla.core.VanillaCorePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.util.Map;

/** /cosmetics — что надето сейчас и как это поменять. */
public final class CosmeticCommand implements CommandExecutor {

    private final VanillaCorePlugin plugin;
    private final CosmeticEngine engine;

    public CosmeticCommand(VanillaCorePlugin plugin, CosmeticEngine engine) {
        this.plugin = plugin;
        this.engine = engine;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Только для игроков");
            return true;
        }

        if (args.length > 0 && args[0].equalsIgnoreCase("reload")) {
            plugin.reloadCosmetics(player);
            player.sendMessage(plugin.messages().get("cosmetics.reloaded"));
            return true;
        }

        CosmeticSet set = engine.setOf(player);
        player.sendMessage(plugin.messages().get("cosmetics.header"));

        boolean empty = true;
        for (CosmeticSet.Kind kind : CosmeticSet.Kind.values()) {
            CosmeticSet.Item item = set.get(kind);
            if (item == null) continue;
            empty = false;
            player.sendMessage(plugin.messages().plain("cosmetics.line", Map.of(
                    "kind", label(kind),
                    "key", item.key(),
                    "serial", item.serial() == null ? "" : " #" + item.serial())));
        }
        if (empty) player.sendMessage(plugin.messages().get("cosmetics.empty"));

        player.sendMessage(Component.text("Открыть коллекцию на сайте →", NamedTextColor.AQUA)
                .clickEvent(ClickEvent.openUrl(plugin.config().siteUrl + "/collection")));
        return true;
    }

    private String label(CosmeticSet.Kind kind) {
        return switch (kind) {
            case TRAIL -> "Шлейф";
            case AURA -> "Аура";
            case PET -> "Питомец";
            case HAT -> "Шляпа";
            case JOIN_EFFECT -> "Эффект входа";
            case NAME_COLOR -> "Цвет ника";
            case TITLE -> "Титул";
            case WORLD_MARK -> "Метка в мире";
        };
    }
}
