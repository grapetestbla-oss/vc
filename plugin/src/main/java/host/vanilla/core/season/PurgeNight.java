package host.vanilla.core.season;

import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import org.bukkit.GameMode;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;

import java.util.Map;

/**
 * Судная ночь. Пока идёт, все играют в режиме приключения — драться можно,
 * ломать и ставить нельзя, — а смерть стоит половины баланса.
 *
 * Состояние держит сайт: включают его в панели, и плагин узнаёт об этом на
 * ближайшем опросе. Сколько VC снять и кому отдать, тоже решает сайт: у
 * плагина нет баланса, а две смерти подряд не должны списать больше, чем есть
 * на счету.
 */
public final class PurgeNight implements Listener {

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    private boolean enabled;
    private int dropPercent = 50;

    public PurgeNight(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    public boolean enabled() {
        return enabled;
    }

    public void poll() {
        plugin.api().onMain(plugin.api().get("/api/mc/purge"), response -> {
            if (response.get("_status").getAsInt() != 200) return;

            boolean now = response.has("enabled") && response.get("enabled").getAsBoolean();
            if (response.has("dropPercent") && !response.get("dropPercent").isJsonNull()) {
                dropPercent = response.get("dropPercent").getAsInt();
            }
            if (now == enabled) return;

            enabled = now;
            plugin.getLogger().warning(enabled ? "Началась судная ночь" : "Судная ночь закончена");
            announce();
            for (Player player : plugin.getServer().getOnlinePlayers()) {
                apply(player);
            }
        });
    }

    private void announce() {
        String key = enabled ? "purge.start" : "purge.end";
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            player.sendMessage(messages.get(key, Map.of("percent", String.valueOf(dropPercent))));
            player.playSound(player.getLocation(),
                    enabled ? Sound.ENTITY_WITHER_SPAWN : Sound.UI_TOAST_CHALLENGE_COMPLETE, 0.6f, 1f);
        }
    }

    /**
     * Ставит игроку режим по состоянию ночи. Вызывается при входе и при смене
     * состояния — тех, у кого режим задан не судной ночью, не трогаем совсем.
     */
    public void apply(Player player) {
        if (exempt(player)) return;
        player.setGameMode(enabled ? GameMode.ADVENTURE : GameMode.SURVIVAL);
        if (enabled) {
            player.sendMessage(messages.get("purge.hint", Map.of("percent", String.valueOf(dropPercent))));
        }
    }

    /**
     * Кого судная ночь не касается.
     *
     * Заключённые остаются в выживании: в деморгане они добывают породу, чтобы
     * сократить срок, а в приключении это невозможно — сторож деморгана к тому
     * же возвращал бы их в зону каждую секунду, увидев чужой режим.
     *
     * Администрация со 2 уровня сидит в наблюдателе, и вытаскивать её оттуда
     * ночь не должна: проверки не прекращаются.
     */
    private boolean exempt(Player player) {
        if (!plugin.auth().authenticated(player)) return true;
        if (plugin.jail().isJailed(player)) return true;
        return plugin.auth().adminLevel(player) >= 2 && plugin.config().staffAlwaysSpectator;
    }

    /**
     * Смерть: сообщаем сайту, кто кого убил, и пересказываем игрокам его ответ.
     * Заключённых не трогаем — за них уже отвечает наказание.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDeath(PlayerDeathEvent event) {
        if (!enabled) return;

        Player victim = event.getEntity();
        if (!plugin.auth().authenticated(victim) || plugin.jail().isJailed(victim)) return;

        Player killer = victim.getKiller();
        Map<String, Object> body = killer == null
                ? Map.of("login", Accounts.name(victim))
                : Map.of("login", Accounts.name(victim), "killer", Accounts.name(killer));

        plugin.api().onMain(plugin.api().post("/api/mc/purge/death", body), response -> {
            if (response.get("_status").getAsInt() != 200) return;
            if (!"ok".equals(response.get("status").getAsString())) return;
            report(response, victim, killer);
        });
    }

    private void report(JsonObject response, Player victim, Player killer) {
        int lost = response.get("lost").getAsInt();
        if (lost <= 0) return;

        if (victim.isOnline()) {
            victim.sendMessage(messages.get("purge.lost", Map.of(
                    "amount", String.valueOf(lost),
                    "balance", response.get("balance").getAsString())));
        }
        // Награду показываем по ответу сайта, а не по наличию убийцы: он мог
        // оказаться без аккаунта, и тогда VC просто сгорели.
        int taken = response.get("taken").getAsInt();
        if (killer != null && killer.isOnline() && taken > 0) {
            killer.sendMessage(messages.get("purge.taken", Map.of(
                    "amount", String.valueOf(taken),
                    "player", Accounts.name(victim))));
        }
    }
}
