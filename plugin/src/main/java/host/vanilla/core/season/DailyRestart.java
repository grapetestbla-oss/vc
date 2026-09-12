package host.vanilla.core.season;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.title.Title;
import org.bukkit.Sound;
import org.bukkit.entity.Player;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

/**
 * Ежедневный перезапуск сервера.
 *
 * Сервер живёт сутками напролёт, и к вечеру расход памяти подходит к потолку —
 * ночная перезагрузка возвращает его к норме, пока на сервере пусто.
 *
 * Предупреждаем заранее и несколько раз: игрок должен успеть дойти до базы и
 * убрать вещи в сундук, а не обнаружить себя в лаве после входа.
 */
public final class DailyRestart {

    /** За сколько секунд до перезапуска предупреждаем. От большего к меньшему. */
    private static final List<Integer> WARNINGS = List.of(600, 300, 120, 60, 30, 10, 5, 4, 3);

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    /** На какие отметки уже предупредили — чтобы не повторяться каждую секунду. */
    private int lastWarned = Integer.MAX_VALUE;
    private boolean stopping;

    public DailyRestart(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    /** Сколько секунд осталось до ближайшего перезапуска. */
    public long secondsLeft() {
        ZoneId zone = ZoneId.of(plugin.config().restartZone);
        LocalTime at = LocalTime.parse(plugin.config().restartAt);
        LocalDateTime now = LocalDateTime.now(zone);
        LocalDateTime next = now.toLocalDate().atTime(at);
        if (!next.isAfter(now)) next = next.plusDays(1);
        return Duration.between(now, next).toSeconds();
    }

    /** Раз в секунду: предупреждаем и в назначенный момент останавливаем сервер. */
    public void tick() {
        if (stopping) return;
        long left = secondsLeft();

        // Перевалили через полночь — начинаем сутки заново.
        if (left > lastWarned) lastWarned = Integer.MAX_VALUE;

        // Момент ловим окном, а не нулём: перевалив через назначенное время,
        // счётчик сразу показывает сутки до следующего раза и ровно нулю не
        // равен никогда. Тик идёт раз в секунду, так что в окно мы попадаем.
        if (left <= 2) {
            stopping = true;
            requestRestart();
            return;
        }

        for (int mark : WARNINGS) {
            if (left <= mark && lastWarned > mark) {
                lastWarned = mark;
                warn(mark);
                return;
            }
        }
    }

    /**
     * Просим сайт перезапустить нас через панель хостинга.
     *
     * Своя остановка тут не годится: панель считает её штатной и сервер обратно
     * не поднимает — к утру никого. Если попросить не вышло, остаёмся работать
     * и пишем в журнал: не перезапустившийся сервер лучше выключенного.
     */
    private void requestRestart() {
        plugin.getLogger().info("Ежедневный перезапуск: просим панель.");
        plugin.api().onMain(plugin.api().post("/api/mc/restart", Map.of()), response -> {
            int status = response.get("_status").getAsInt();
            if (status == 200) {
                plugin.getLogger().info("Панель приняла перезапуск.");
                return;
            }
            stopping = false;
            // Отметку сбрасываем на сутки вперёд, иначе тик будет ломиться в
            // сайт каждую секунду до самой полуночи.
            lastWarned = 0;
            plugin.getLogger().warning("Перезапуск не удался (код " + status
                    + "). Сервер продолжает работать, перезапустите вручную.");
            for (Player player : plugin.getServer().getOnlinePlayers()) {
                if (plugin.auth().adminLevel(player) >= 4) {
                    player.sendMessage(messages.get("restart.failed"));
                }
            }
        });
    }

    private void warn(int seconds) {
        Component line = messages.get("restart.warning", Map.of(
                "seconds", String.valueOf(seconds),
                "human", human(seconds)));
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            player.sendMessage(line);
            // Последние секунды показываем титром: в чат в этот момент никто
            // уже не смотрит.
            if (seconds <= 10) {
                player.showTitle(Title.title(
                        messages.plain("restart.title", Map.of("seconds", String.valueOf(seconds))),
                        Component.empty(),
                        Title.Times.times(Duration.ZERO, Duration.ofMillis(900), Duration.ofMillis(200))));
            }
            player.playSound(player.getLocation(), Sound.BLOCK_NOTE_BLOCK_PLING, 0.7f,
                    seconds <= 10 ? 1.6f : 1.0f);
        }
    }

    /** «10 минут», «30 секунд» — словами, чтобы читалось в чате. */
    private static String human(int seconds) {
        if (seconds % 60 == 0 && seconds >= 60) {
            int minutes = seconds / 60;
            String word = minutes % 10 == 1 && minutes % 100 != 11 ? "минуту"
                    : minutes % 10 >= 2 && minutes % 10 <= 4 && (minutes % 100 < 10 || minutes % 100 >= 20)
                            ? "минуты" : "минут";
            return minutes + " " + word;
        }
        String word = seconds % 10 == 1 && seconds % 100 != 11 ? "секунду"
                : seconds % 10 >= 2 && seconds % 10 <= 4 && (seconds % 100 < 10 || seconds % 100 >= 20)
                        ? "секунды" : "секунд";
        return seconds + " " + word;
    }
}
