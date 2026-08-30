package host.vanilla.core.punish;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import io.papermc.paper.event.player.AsyncChatEvent;
import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.FoodLevelChangeEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;
import org.bukkit.event.inventory.InventoryType;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerPortalEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.event.player.PlayerTeleportEvent;

import java.util.Locale;

/** Всё, что заключённому нельзя, и всё, что засчитывается как отработка. */
public final class JailListener implements Listener {

    private final VanillaCorePlugin plugin;
    private final JailManager jail;
    private final Messages messages;

    public JailListener(VanillaCorePlugin plugin, JailManager jail, Messages messages) {
        this.plugin = plugin;
        this.jail = jail;
        this.messages = messages;
    }

    private boolean jailed(Player player) {
        return jail.isJailed(player);
    }

    @EventHandler(ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();
        if (!jailed(player)) return;

        Block block = event.getBlock();
        if (!jail.zone().isMineBlock(block)) {
            event.setCancelled(true);
            player.sendMessage(messages.get("jail.blocked"));
            return;
        }
        // Отработка не должна превращаться в фарм ресурсов.
        event.setDropItems(false);
        event.setExpToDrop(0);
        jail.countMinedBlock(player);
        plugin.jailJobs().onBlockMined(player);

        Material material = plugin.config().jailMineMaterial;
        plugin.getServer().getScheduler().runTaskLater(plugin,
                () -> block.setType(material, false),
                plugin.config().jailRegenSeconds * 20L);
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        if (jailed(event.getPlayer())) {
            event.setCancelled(true);
            event.getPlayer().sendMessage(messages.get("jail.blocked"));
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onDrop(PlayerDropItemEvent event) {
        if (jailed(event.getPlayer())) event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onCommand(PlayerCommandPreprocessEvent event) {
        Player player = event.getPlayer();
        if (!jailed(player)) return;
        String command = event.getMessage().substring(1).split(" ")[0].toLowerCase(Locale.ROOT);
        if (plugin.config().jailAllowedCommands.contains(command)) return;
        event.setCancelled(true);
        player.sendMessage(messages.get("jail.command-blocked"));
    }

    @EventHandler(ignoreCancelled = true)
    public void onInventoryOpen(InventoryOpenEvent event) {
        if (event.getPlayer() instanceof Player player && jailed(player)
                && event.getInventory().getType() != InventoryType.PLAYER) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onInventoryClick(InventoryClickEvent event) {
        if (event.getWhoClicked() instanceof Player player && jailed(player)
                && event.getInventory().getType() != InventoryType.PLAYER
                && event.getInventory().getType() != InventoryType.CRAFTING) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onInteract(PlayerInteractEvent event) {
        if (jailed(event.getPlayer()) && event.getClickedBlock() != null) event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        if (event.getEntity() instanceof Player player && jailed(player)) event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onHunger(FoodLevelChangeEvent event) {
        if (event.getEntity() instanceof Player player && jailed(player)) event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onTeleport(PlayerTeleportEvent event) {
        if (!jailed(event.getPlayer())) return;
        if (event.getCause() == PlayerTeleportEvent.TeleportCause.PLUGIN) return;
        if (event.getTo() != null && jail.zone().isInside(event.getTo())) return;
        event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onPortal(PlayerPortalEvent event) {
        if (jailed(event.getPlayer())) event.setCancelled(true);
    }

    @EventHandler
    public void onRespawn(PlayerRespawnEvent event) {
        if (jailed(event.getPlayer())) event.setRespawnLocation(jail.zone().spawn());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        Player player = event.getPlayer();
        if (!jailed(player)) return;
        if (event.getTo().getBlockX() == event.getFrom().getBlockX()
                && event.getTo().getBlockY() == event.getFrom().getBlockY()
                && event.getTo().getBlockZ() == event.getFrom().getBlockZ()) {
            return;
        }
        if (!jail.zone().isInside(event.getTo())) player.teleport(jail.zone().spawn());
    }

    /** Заключённые говорят только между собой — иначе общий чат тонет в апелляциях. */
    @EventHandler(ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        if (!plugin.config().jailIsolateChat) return;
        boolean senderJailed = jailed(event.getPlayer());
        event.viewers().removeIf(audience -> {
            if (!(audience instanceof Player viewer)) return false;
            if (plugin.auth().adminLevel(viewer) >= 2) return false;
            return senderJailed != jailed(viewer);
        });
    }
}
