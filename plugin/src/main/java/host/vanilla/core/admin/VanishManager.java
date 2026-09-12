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
    /** Кому уже напомнили, что в чате его видно. Сбрасывается при выключении. */
    private final Set<UUID> warned = ConcurrentHashMap.newKeySet();
    /** О чьём входе сервер уже объявил — по ним же объявляем и выход. */
    private final Set<UUID> announced = ConcurrentHashMap.newKeySet();

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
        warned.remove(player.getUniqueId());
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
        warned.remove(player.getUniqueId());
    }

    /** Сколько игроков видно со стороны: невидимок наружу не показываем. */
    public int publicOnline() {
        int count = 0;
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            if (!vanished(player)) count++;
        }
        return count;
    }

    /**
     * Вход. Сообщение гасим всем без разбора и объявляем сами — уже после
     * ввода пароля.
     *
     * Иначе объявить вовремя нечем: уровень админки приходит с сайта только
     * после авторизации, а сообщение сервер отправляет в момент подключения —
     * то есть раньше, чем становится известно, кого надо прятать. Заодно
     * пропадают объявления о тех, кто так и не вошёл: набрал неверный пароль и
     * улетел с сервера.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        Player joined = event.getPlayer();
        event.joinMessage(null);
        announced.remove(joined.getUniqueId());
        if (vanished(joined)) hide(joined);

        if (sees(joined)) return;
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            if (vanished(player) && !player.equals(joined)) joined.hidePlayer(plugin, player);
        }
    }

    /**
     * Игрок ввёл пароль: администрацию со 2 уровня сразу уводим в невидимость,
     * остальных объявляем. Админ приходит смотреть, а не участвовать, и
     * объявление о его входе меняет поведение тех, за кем он пришёл смотреть.
     */
    public void onAuthenticated(Player player) {
        if (plugin.auth().adminLevel(player) >= LEVEL) {
            if (!vanished(player)) hide(player);
            player.sendMessage(messages.get("staff.hide-auto"));
            return;
        }
        if (!announced.add(player.getUniqueId())) return;
        plugin.getServer().broadcast(messages.plain("join.announce",
                Map.of("player", host.vanilla.core.util.Accounts.name(player))));
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        // О выходе говорим только про тех, о чьём входе говорили: иначе о
        // невидимке и о невошедшем сервер сообщит на ровном месте.
        if (!announced.remove(player.getUniqueId())) event.quitMessage(null);
    }

    /** Достижения выдают присутствие не хуже чата. */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onAdvancement(PlayerAdvancementDoneEvent event) {
        if (vanished(event.getPlayer())) event.message(null);
    }

    /**
     * Писать в общий чат невидимке никто не запрещает: захотел сказать — значит
     * сказал. Запрет тут только путал — админ не понимал, почему чат «сломался».
     * Ограничиваемся напоминанием, и то один раз за сессию невидимости.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onChat(AsyncChatEvent event) {
        Player player = event.getPlayer();
        if (!vanished(player) || !warned.add(player.getUniqueId())) return;
        player.sendMessage(messages.get("staff.hide-chat"));
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onDeath(PlayerDeathEvent event) {
        if (vanished(event.getPlayer())) event.deathMessage(null);
    }

    @EventHandler(ignoreCancelled = true)
    public void onTarget(EntityTargetEvent event) {
        if (event.getTarget() instanceof Player player && vanished(player)) event.setCancelled(true);
    }

    /**
     * Внешний счётчик игроков: в списке серверов и в мониторингах невидимка
     * тоже не должен считаться. Иначе «онлайн 3» при двух игроках и одном
     * скрытом админе выдавал бы его первым же взглядом на список.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onPing(com.destroystokyo.paper.event.server.PaperServerListPingEvent event) {
        int hiddenNow = plugin.getServer().getOnlinePlayers().size() - publicOnline();
        if (hiddenNow <= 0) return;
        event.setNumPlayers(Math.max(0, event.getNumPlayers() - hiddenNow));
        // В списке имён при наведении на сервер невидимок тоже быть не должно:
        // Paper отдаёт его перебором, из которого игрока можно убрать.
        var iterator = event.iterator();
        while (iterator.hasNext()) {
            if (vanished(iterator.next())) iterator.remove();
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (event.getEntity() instanceof Player player && vanished(player)) event.setCancelled(true);
    }
}
