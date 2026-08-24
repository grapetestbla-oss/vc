package host.vanilla.core.admin;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.title.Title;
import org.bukkit.entity.Player;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** /check — вызов на проверку: игрок обездвижен, на экране титры, в чате ссылка. */
public final class CheckManager {

    public record Check(UUID adminId, String adminName, String link, long startedAt) {}

    private final VanillaCorePlugin plugin;
    private final Messages messages;
    private final Map<UUID, Check> checks = new HashMap<>();

    public CheckManager(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    public boolean isChecked(Player player) {
        return checks.containsKey(player.getUniqueId());
    }

    public Check checkOf(Player player) {
        return checks.get(player.getUniqueId());
    }

    public void start(Player admin, Player target, String link) {
        checks.put(target.getUniqueId(), new Check(admin.getUniqueId(), admin.getName(), link, System.currentTimeMillis()));
        target.setWalkSpeed(0f);
        target.setFlySpeed(0f);

        target.showTitle(Title.title(
                Messages.mm("<red><bold>ПРОВЕРКА НА ЧИТЫ"),
                Messages.mm("<yellow>Следуйте указаниям администратора"),
                Title.Times.times(Duration.ofMillis(300), Duration.ofSeconds(8), Duration.ofMillis(500))));

        target.sendMessage(messages.get("check.started", Map.of("admin", admin.getName())));
        target.sendMessage(Component.text(link, NamedTextColor.AQUA)
                .clickEvent(ClickEvent.openUrl(link)));

        admin.sendMessage(messages.get("check.started-admin", Map.of("player", target.getName())));
        plugin.logAdminAction(admin, "check.start", Accounts.name(target), Map.of("link", link));
    }

    public void finish(Player target, Player admin, boolean passed) {
        Check check = checks.remove(target.getUniqueId());
        if (check == null) return;
        target.setWalkSpeed(0.2f);
        target.setFlySpeed(0.1f);
        target.sendMessage(messages.get(passed ? "check.passed" : "check.failed"));
        if (admin != null) {
            plugin.logAdminAction(admin, passed ? "check.pass" : "check.fail", Accounts.name(target), Map.of());
        }
    }

    /** Выход во время проверки — сам по себе повод для разбирательства. */
    public void onQuit(Player target) {
        Check check = checks.remove(target.getUniqueId());
        if (check == null) return;
        plugin.getServer().getOnlinePlayers().stream()
                .filter(player -> plugin.auth().adminLevel(player) >= 2)
                .forEach(player -> player.sendMessage(messages.get("check.left", Map.of(
                        "player", target.getName(),
                        "admin", check.adminName()))));
        plugin.logAdminAction(null, "check.player_left", Accounts.name(target),
                Map.of("admin", check.adminName()));
    }
}
