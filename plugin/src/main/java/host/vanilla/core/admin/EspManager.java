package host.vanilla.core.admin;

import host.vanilla.core.VanillaCorePlugin;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.scoreboard.Scoreboard;
import org.bukkit.scoreboard.Team;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Подсветка игроков.
 *
 * Медиа светятся красным для всех — это часть их роли, зрители должны видеть,
 * что человек снимает. Админам 2+ доступен /esp: свечение целей отправляется
 * персонально (sendPotionEffectChange), поэтому обычные игроки его не видят.
 */
public final class EspManager {

    private static final String TEAM_MEDIA = "vc_media";
    private static final String TEAM_STAFF = "vc_staff";

    private final VanillaCorePlugin plugin;
    private final Set<UUID> espEnabled = new HashSet<>();

    public EspManager(VanillaCorePlugin plugin) {
        this.plugin = plugin;
        setupTeams();
    }

    private void setupTeams() {
        Scoreboard board = Bukkit.getScoreboardManager().getMainScoreboard();
        team(board, TEAM_MEDIA, NamedTextColor.RED);
        team(board, TEAM_STAFF, NamedTextColor.YELLOW);
    }

    private void team(Scoreboard board, String name, NamedTextColor color) {
        Team team = board.getTeam(name);
        if (team == null) team = board.registerNewTeam(name);
        team.color(color);
    }

    /** Ставит игрока в команду по его уровню — от неё зависит цвет свечения. */
    public void applyRole(Player player, int adminLevel) {
        Scoreboard board = Bukkit.getScoreboardManager().getMainScoreboard();
        board.getTeams().forEach(team -> team.removeEntry(player.getName()));

        if (adminLevel == 1) {
            Team media = board.getTeam(TEAM_MEDIA);
            if (media != null) media.addEntry(player.getName());
            player.setGlowing(true); // медиа видно всем
        } else if (adminLevel >= 2) {
            Team staff = board.getTeam(TEAM_STAFF);
            if (staff != null) staff.addEntry(player.getName());
            player.setGlowing(false);
        } else {
            player.setGlowing(false);
        }
    }

    public boolean toggle(Player admin) {
        UUID id = admin.getUniqueId();
        if (espEnabled.remove(id)) {
            clearFor(admin);
            return false;
        }
        espEnabled.add(id);
        refreshFor(admin);
        return true;
    }

    public void disable(Player admin) {
        if (espEnabled.remove(admin.getUniqueId())) clearFor(admin);
    }

    /** Раз в несколько секунд продлеваем свечение целей для тех, у кого ESP включён. */
    public void refresh() {
        for (UUID id : Set.copyOf(espEnabled)) {
            Player admin = Bukkit.getPlayer(id);
            if (admin == null) {
                espEnabled.remove(id);
                continue;
            }
            refreshFor(admin);
        }
    }

    private void refreshFor(Player admin) {
        int myLevel = plugin.auth().adminLevel(admin);
        PotionEffect glow = new PotionEffect(PotionEffectType.GLOWING, 200, 0, false, false);
        for (Player target : Bukkit.getOnlinePlayers()) {
            if (target.equals(admin)) continue;
            // Видно только тех, кто ниже по уровню: старших админов ESP не палит.
            if (plugin.auth().adminLevel(target) >= myLevel) continue;
            admin.sendPotionEffectChange(target, glow);
        }
    }

    private void clearFor(Player admin) {
        for (Player target : Bukkit.getOnlinePlayers()) {
            if (target.equals(admin)) continue;
            if (target.hasPotionEffect(PotionEffectType.GLOWING)) continue;
            admin.sendPotionEffectChangeRemove(target, PotionEffectType.GLOWING);
        }
    }

    public boolean enabled(Player admin) {
        return espEnabled.contains(admin.getUniqueId());
    }
}
