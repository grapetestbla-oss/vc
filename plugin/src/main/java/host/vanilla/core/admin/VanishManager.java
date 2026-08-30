package host.vanilla.core.admin;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import io.papermc.paper.event.player.AsyncChatEvent;
import org.bukkit.event.entity.EntityTargetEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.player.PlayerAdvancementDoneEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Полная невидимость администрации: /chide.
 *
 * Игрока не видно ни в мире, ни в табе, ни в сообщениях о входе и выходе.
 * Видят его только те, кто сам может уйти в невидимость — иначе админы
 * в скрытом режиме натыкались бы друг на друга.
 */
public final class VanishManager implements Listener {

    /** С какого уровня доступна невидимость и с какого её видно. */
    public static final int LEVEL = 2;

    private final VanillaCorePlugin plugin;
    private final Messages messages;
    private final Set<UUID> hidden = ConcurrentHashMap.newKeySet();

    public VanishManager(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    public boolean vanished(Player player) {
        return hidden.contains(player.getUniqueId());
    }

    /** Переключает режим и возвращает новое состояние. */
    public boolean toggle(Player player) {
        if (vanished(player)) {
            show(player);
            return false;
        }
        hide(player);
        return true;
    }

    private void hide(Player player) {
        hidden.add(player.getUniqueId());
        for (Player viewer : plugin.getServer().getOnlinePlayers()) {
            if (viewer.equals(player) || sees(viewer)) continue;
            viewer.hidePlayer(plugin, player);
        }
        // Невидимость нужна и самому игроку: иначе он видит свои же частицы,
        // а мобы у Bedrock-клиентов реагируют на модель через Geyser.
        player.addPotionEffect(new PotionEffect(PotionEffectType.INVISIBILITY,
                PotionEffect.INFINITE_DURATION, 0, false, false, false));
        player.setSleepingIgnored(true);
        player.setCanPickupItems(false);
    }

    private void show(Player player) {
        hidden.remove(player.getUniqueId());
        for (Player viewer : plugin.getServer().getOnlinePlayers()) {
            viewer.showPlayer(plugin, player);
        }
        player.removePotionEffect(PotionEffectType.INVISIBILITY);
        player.setSleepingIgnored(false);
        player.setCanPickupItems(true);
    }

    /** Сообщение в экшн-баре, чтобы не забыть, что ты невидим. */
    public void tick() {
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            if (vanished(player)) player.sendActionBar(messages.plain("staff.hide-bar", Map.of()));
        }
    }

    private boolean sees(Player viewer) {
        return plugin.auth().adminLevel(viewer) >= LEVEL;
    }

    public void forget(Player player) {
        hidden.remove(player.getUniqueId());
    }

    /** Заходящий не должен увидеть тех, кто уже скрыт. */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        Player joined = event.getPlayer();
        if (vanished(joined)) {
            event.joinMessage(null);
            hide(joined);
        }
        if (sees(joined)) return;
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            if (vanished(player) && !player.equals(joined)) joined.hidePlayer(plugin, player);
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        if (vanished(event.getPlayer())) event.quitMessage(null);
    }

    /** Достижения выдают присутствие не хуже чата. */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onAdvancement(PlayerAdvancementDoneEvent event) {
        if (vanished(event.getPlayer())) event.message(null);
    }

    /** Обычный чат выдал бы невидимку — пусть пишет в админский. */
    @EventHandler(ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        if (!vanished(event.getPlayer())) return;
        event.setCancelled(true);
        event.getPlayer().sendMessage(messages.get("staff.hide-chat"));
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onDeath(PlayerDeathEvent event) {
        if (vanished(event.getPlayer())) event.deathMessage(null);
    }

    @EventHandler(ignoreCancelled = true)
    public void onTarget(EntityTargetEvent event) {
        if (event.getTarget() instanceof Player player && vanished(player)) event.setCancelled(true);
    }

    @EventHandler(ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (event.getEntity() instanceof Player player && vanished(player)) event.setCancelled(true);
    }
}
