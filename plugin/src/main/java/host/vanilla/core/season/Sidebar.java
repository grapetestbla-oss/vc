package host.vanilla.core.season;

import host.vanilla.core.VanillaCorePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.scoreboard.Criteria;
import org.bukkit.scoreboard.DisplaySlot;
import org.bukkit.scoreboard.Objective;
import org.bukkit.scoreboard.Scoreboard;
import org.bukkit.scoreboard.Team;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Боковая панель: ник, уровень, баланс и прогресс дневной нормы.
 *
 * В табе те же цифры плюс состояние сервера, но таб надо держать нажатым.
 * Панель висит всегда, поэтому в ней только про самого игрока.
 *
 * Строки обновляем через команды табло, а не пересоздаём табло целиком: иначе
 * панель мигала бы при каждом обновлении.
 */
public final class Sidebar {

    private static final MiniMessage MM = MiniMessage.miniMessage();
    /** Табло различает строки по «игрокам», поэтому у каждой свой ключ. */
    private static final List<String> KEYS = List.of("l0", "l1", "l2", "l3", "l4", "l5");

    private final VanillaCorePlugin plugin;
    private final Map<UUID, Scoreboard> boards = new HashMap<>();

    public Sidebar(VanillaCorePlugin plugin) {
        this.plugin = plugin;
    }

    /** Прогресс дневной нормы, присланный сайтом. */
    public record Daily(int activeSec, int goalSec, boolean rewarded) {}

    private final Map<UUID, Daily> daily = new HashMap<>();

    public void setDaily(Player player, Daily value) {
        daily.put(player.getUniqueId(), value);
    }

    public void forget(Player player) {
        daily.remove(player.getUniqueId());
        boards.remove(player.getUniqueId());
    }

    public void refresh() {
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            if (plugin.auth().authenticated(player)) show(player);
        }
    }

    private void show(Player player) {
        Scoreboard board = boards.get(player.getUniqueId());
        if (board == null || player.getScoreboard() != board) {
            board = Bukkit.getScoreboardManager().getNewScoreboard();
            boards.put(player.getUniqueId(), board);
            player.setScoreboard(board);
        }

        Objective objective = board.getObjective("vc");
        if (objective == null) {
            objective = board.registerNewObjective("vc", Criteria.DUMMY,
                    MM.deserialize("<gradient:#f5c451:#ffe9a8><bold>VanillaCraft</bold></gradient>"));
            objective.setDisplaySlot(DisplaySlot.SIDEBAR);
        }

        var profile = plugin.auth().profile(player);
        Daily progress = daily.get(player.getUniqueId());

        List<Component> lines = List.of(
                Component.empty(),
                MM.deserialize("<gray>Игрок</gray> <white>" + player.getName() + "</white>"),
                MM.deserialize("<gray>Уровень</gray> <white>" + profile.level() + "</white>"),
                MM.deserialize("<gray>Баланс</gray> <gold>" + profile.balanceVc() + " VC</gold>"),
                MM.deserialize(dailyLine(progress)),
                Component.empty());

        // Очки задают порядок: верхняя строка — с наибольшим числом.
        for (int i = 0; i < KEYS.size(); i++) {
            String key = KEYS.get(i);
            Team team = board.getTeam(key);
            if (team == null) {
                team = board.registerNewTeam(key);
                team.addEntry(key);
            }
            team.prefix(lines.get(i));
            objective.getScore(key).setScore(KEYS.size() - i);
        }
    }

    /** Строка нормы: сколько часов набрано из дневных и получена ли награда. */
    private String dailyLine(Daily progress) {
        if (progress == null) return "<gray>Норма дня</gray> <dark_gray>—</dark_gray>";
        if (progress.rewarded()) return "<gray>Норма дня</gray> <green>выполнена</green>";

        double hours = progress.activeSec() / 3600.0;
        double goal = progress.goalSec() / 3600.0;
        return String.format("<gray>Норма дня</gray> <white>%.1f</white><gray>/%.0f ч</gray>", hours, goal);
    }
}
