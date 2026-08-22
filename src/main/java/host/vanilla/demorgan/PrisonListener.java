package host.vanilla.demorgan;

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
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerPortalEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.event.player.PlayerTeleportEvent;

import java.util.Locale;

/** Всё, что заключённому нельзя, и всё, что засчитывается как отработка. */
public final class PrisonListener implements Listener {

    private final DemorganPlugin plugin;
    private final PluginConfig config;
    private final ZoneManager zone;
    private final PunishmentManager manager;
    private final Messages messages;

    public PrisonListener(DemorganPlugin plugin, PluginConfig config, ZoneManager zone,
                          PunishmentManager manager, Messages messages) {
        this.plugin = plugin;
        this.config = config;
        this.zone = zone;
        this.manager = manager;
        this.messages = messages;
    }

    private boolean jailed(Player player) {
        return manager.isJailed(player.getUniqueId());
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        manager.handleJoin(event.getPlayer());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        if (jailed(event.getPlayer())) {
            manager.save();
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();
        if (!jailed(player)) return;

        Block block = event.getBlock();
        if (!zone.isMineBlock(block)) {
            event.setCancelled(true);
            player.sendMessage(messages.get("action-blocked"));
            return;
        }
        // Отработка не должна превращаться в фарм ресурсов.
        event.setDropItems(false);
        event.setExpToDrop(0);
        manager.countMinedBlock(player);

        Material material = config.mineMaterial;
        plugin.getServer().getScheduler().runTaskLater(plugin,
                () -> block.setType(material, false),
                config.regenSeconds * 20L);
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent event) {
        if (jailed(event.getPlayer())) {
            event.setCancelled(true);
            event.getPlayer().sendMessage(messages.get("action-blocked"));
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onDrop(PlayerDropItemEvent event) {
        if (jailed(event.getPlayer())) {
            event.setCancelled(true);
            event.getPlayer().sendMessage(messages.get("action-blocked"));
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onCommand(PlayerCommandPreprocessEvent event) {
        Player player = event.getPlayer();
        if (!jailed(player)) return;
        String command = event.getMessage().substring(1).split(" ")[0].toLowerCase(Locale.ROOT);
        if (!config.allowedCommands.contains(command)) {
            event.setCancelled(true);
            player.sendMessage(messages.get("command-blocked"));
        }
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
        if (jailed(event.getPlayer()) && event.getClickedBlock() != null) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        if (config.invulnerable && event.getEntity() instanceof Player player && jailed(player)) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onHunger(FoodLevelChangeEvent event) {
        if (config.invulnerable && event.getEntity() instanceof Player player && jailed(player)) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onTeleport(PlayerTeleportEvent event) {
        if (!jailed(event.getPlayer())) return;
        if (event.getCause() == PlayerTeleportEvent.TeleportCause.PLUGIN) return;
        if (event.getTo() != null && zone.isInside(event.getTo())) return;
        event.setCancelled(true);
        event.getPlayer().sendMessage(messages.get("action-blocked"));
    }

    @EventHandler(ignoreCancelled = true)
    public void onPortal(PlayerPortalEvent event) {
        if (jailed(event.getPlayer())) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onRespawn(PlayerRespawnEvent event) {
        if (jailed(event.getPlayer())) {
            event.setRespawnLocation(zone.spawnLocation());
        }
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
        if (!zone.isInside(event.getTo())) {
            player.teleport(zone.spawnLocation());
        }
    }

    /** Заключённые говорят только между собой — иначе общий чат тонет в апелляциях. */
    @EventHandler(ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        if (!config.isolateChat) return;
        boolean senderJailed = jailed(event.getPlayer());
        event.viewers().removeIf(audience -> {
            if (!(audience instanceof Player viewer)) return false;
            if (viewer.hasPermission("demorgan.seechat")) return false;
            return senderJailed != jailed(viewer);
        });
    }
}
