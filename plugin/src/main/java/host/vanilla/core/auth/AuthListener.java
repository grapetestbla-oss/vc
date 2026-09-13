package host.vanilla.core.auth;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import io.papermc.paper.event.player.AsyncChatEvent;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.Locale;
import java.util.Set;

/** Пока игрок не ввёл пароль, ему нельзя ничего. */
public final class AuthListener implements Listener {

    private static final Set<String> ALLOWED = Set.of("login", "l", "2fa", "reg", "register");

    /** Команды, в аргументах которых пароль или одноразовый код. */
    private static final Set<String> SECRET = Set.of("login", "l", "2fa", "reg", "register", "changepassword");

    private final VanillaCorePlugin plugin;
    private final AuthManager auth;
    private final Messages messages;

    public AuthListener(VanillaCorePlugin plugin, AuthManager auth, Messages messages) {
        this.plugin = plugin;
        this.auth = auth;
        this.messages = messages;
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        auth.onJoin(event.getPlayer());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        plugin.onPlayerQuit(event.getPlayer());
        auth.onQuit(event.getPlayer());
    }

    private boolean blocked(Player player) {
        return !auth.authenticated(player);
    }

    /**
     * Команды с паролем не должны попадать в лог сервера.
     *
     * Paper пишет каждую команду игрока строкой «issued server command», и
     * пароль из /login оказывается в logs/latest.log открытым текстом — а лог
     * виден всем, у кого есть доступ к панели, и лежит в ротациях месяцами.
     *
     * Отменяем событие и выполняем команду сами: строку пишет обработчик
     * пакета, а Bukkit.dispatchCommand — нет. Приоритет самый низкий, чтобы
     * успеть до остальных, и MONITOR-слушатели чужих плагинов такую команду
     * тоже не увидят: пароль не должен уходить дальше, чем нужно.
     */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onSecretCommand(PlayerCommandPreprocessEvent event) {
        String line = event.getMessage();
        String name = line.substring(1).split(" ")[0].toLowerCase(Locale.ROOT);
        if (!SECRET.contains(name)) return;
        // Без аргумента прятать нечего, а обычный путь короче и надёжнее.
        if (!line.contains(" ")) return;

        event.setCancelled(true);
        plugin.getServer().dispatchCommand(event.getPlayer(), line.substring(1));
    }

    @EventHandler(ignoreCancelled = true)
    public void onCommand(PlayerCommandPreprocessEvent event) {
        if (!blocked(event.getPlayer())) return;
        String command = event.getMessage().substring(1).split(" ")[0].toLowerCase(Locale.ROOT);
        if (ALLOWED.contains(command)) return;
        event.setCancelled(true);
        event.getPlayer().sendMessage(messages.get("auth.prompt"));
    }

    @EventHandler(ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        if (blocked(event.getPlayer())) {
            event.setCancelled(true);
            event.getPlayer().sendMessage(messages.get("auth.prompt"));
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        if (!blocked(event.getPlayer())) return;
        if (event.getFrom().getBlockX() != event.getTo().getBlockX()
                || event.getFrom().getBlockZ() != event.getTo().getBlockZ()) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true) public void onBreak(BlockBreakEvent e) { cancel(e.getPlayer(), e); }
    @EventHandler(ignoreCancelled = true) public void onPlace(BlockPlaceEvent e) { cancel(e.getPlayer(), e); }
    @EventHandler(ignoreCancelled = true) public void onDrop(PlayerDropItemEvent e) { cancel(e.getPlayer(), e); }
    @EventHandler(ignoreCancelled = true) public void onInteract(PlayerInteractEvent e) { cancel(e.getPlayer(), e); }

    @EventHandler(ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (event.getEntity() instanceof Player player && blocked(player)) event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onInventory(InventoryOpenEvent event) {
        if (event.getPlayer() instanceof Player player && blocked(player)) event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        if (event.getEntity() instanceof Player player && blocked(player)) event.setCancelled(true);
    }

    private void cancel(Player player, org.bukkit.event.Cancellable event) {
        if (blocked(player)) event.setCancelled(true);
    }
}
