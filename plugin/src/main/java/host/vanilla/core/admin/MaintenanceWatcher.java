package host.vanilla.core.admin;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import org.bukkit.entity.Player;

import java.util.Map;

/**
 * Техработы. Состояние живёт на сайте: плагин спрашивает его раз в несколько
 * секунд и выгоняет всех, кроме чиф-администратора. Кик по одному флагу, а не
 * по списку ников: включил на сайте — сервер закрылся сам.
 */
public final class MaintenanceWatcher {

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    private boolean enabled;
    private String reason = "Технические работы";

    public MaintenanceWatcher(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    public boolean enabled() {
        return enabled;
    }

    public String reason() {
        return reason;
    }

    public void poll() {
        plugin.api().onMain(plugin.api().get("/api/mc/maintenance"), response -> {
            if (response.get("_status").getAsInt() != 200) return;

            boolean now = response.has("enabled") && response.get("enabled").getAsBoolean();
            if (response.has("reason") && !response.get("reason").isJsonNull()) {
                String text = response.get("reason").getAsString();
                if (!text.isBlank()) reason = text;
            }

            boolean started = now && !enabled;
            enabled = now;
            if (!enabled) return;

            if (started) {
                plugin.getLogger().warning("Включены техработы: " + reason);
            }
            for (Player player : plugin.getServer().getOnlinePlayers()) {
                kickIfNeeded(player);
            }
        });
    }

    /** Кикает игрока, если техработы идут, а уровня админки не хватает. */
    public boolean kickIfNeeded(Player player) {
        if (!enabled) return false;
        if (plugin.auth().adminLevel(player) >= 5) return false;

        Component message = messages.get("maintenance.kick", Map.of("reason", reason));
        plugin.getServer().getScheduler().runTask(plugin, () -> player.kick(message));
        return true;
    }
}
