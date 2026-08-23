package host.vanilla.core.admin;

import host.vanilla.core.VanillaCorePlugin;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerTeleportEvent;

import java.util.Locale;
import java.util.Set;

/** Ограничения для проверяемого игрока и защита от админского вмешательства в мир. */
public final class StaffListener implements Listener {

    private static final Set<String> CHECK_ALLOWED = Set.of("check", "report", "login", "2fa");

    private final VanillaCorePlugin plugin;
    private final CheckManager checks;

    public StaffListener(VanillaCorePlugin plugin, CheckManager checks) {
        this.plugin = plugin;
        this.checks = checks;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        if (!checks.isChecked(event.getPlayer())) return;
        if (event.getFrom().getBlockX() != event.getTo().getBlockX()
                || event.getFrom().getBlockZ() != event.getTo().getBlockZ()) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onTeleport(PlayerTeleportEvent event) {
        if (checks.isChecked(event.getPlayer())
                && event.getCause() != PlayerTeleportEvent.TeleportCause.PLUGIN) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onCommand(PlayerCommandPreprocessEvent event) {
        if (!checks.isChecked(event.getPlayer())) return;
        String command = event.getMessage().substring(1).split(" ")[0].toLowerCase(Locale.ROOT);
        if (!CHECK_ALLOWED.contains(command)) event.setCancelled(true);
    }

    /** Админ в наблюдателе всё равно не должен трогать мир — на случай смены режима. */
    @EventHandler(ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        blockIfStaff(event.getPlayer(), event);
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        blockIfStaff(event.getPlayer(), event);
    }

    private void blockIfStaff(Player player, org.bukkit.event.Cancellable event) {
        if (!plugin.config().staffAlwaysSpectator) return;
        if (plugin.auth().adminLevel(player) >= 2 && !plugin.jail().isJailed(player)) {
            event.setCancelled(true);
        }
    }
}
