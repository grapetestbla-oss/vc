package host.vanilla.core.season;

import host.vanilla.core.VanillaCorePlugin;
import io.papermc.paper.event.player.AsyncChatEvent;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Кто из игроков действительно играет, а кто оставил клиент включённым.
 *
 * Нужен для дневной нормы: без этого её закрывал бы любой, кто ушёл на ночь,
 * и награда перестала бы что-то значить.
 *
 * Активностью считаем перемещение между блоками, ломание, установку, клик и
 * сообщение в чат. Поворот головы не в счёт — им отлично «играет» груз на
 * клавише мыши.
 */
public final class ActivityTracker implements Listener {

    private final VanillaCorePlugin plugin;
    private final Map<UUID, Long> lastAction = new ConcurrentHashMap<>();

    public ActivityTracker(VanillaCorePlugin plugin) {
        this.plugin = plugin;
    }

    private void touch(Player player) {
        lastAction.put(player.getUniqueId(), System.currentTimeMillis());
    }

    /** Активен ли игрок сейчас — по нему решается, засчитывать ли минуту. */
    public boolean active(Player player) {
        Long last = lastAction.get(player.getUniqueId());
        if (last == null) return false;
        return System.currentTimeMillis() - last <= plugin.config().afkMinutes * 60_000L;
    }

    public void forget(Player player) {
        lastAction.remove(player.getUniqueId());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        // Только смена блока: поворот головы активностью не считается.
        if (event.getFrom().getBlockX() == event.getTo().getBlockX()
                && event.getFrom().getBlockY() == event.getTo().getBlockY()
                && event.getFrom().getBlockZ() == event.getTo().getBlockZ()) {
            return;
        }
        touch(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        touch(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        touch(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onInteract(PlayerInteractEvent event) {
        touch(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        touch(event.getPlayer());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        forget(event.getPlayer());
    }
}
