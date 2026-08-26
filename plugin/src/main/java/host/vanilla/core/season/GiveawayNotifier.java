package host.vanilla.core.season;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Плашка о розыгрыше: что разыгрывают, какое условие и сколько игрок уже
 * наиграл. Часы берём с сайта — там же, где их считают, чтобы цифра в игре и
 * на сайте не расходились.
 */
public final class GiveawayNotifier {

    /** Один активный розыгрыш в том виде, в каком его отдал сайт. */
    private record Giveaway(String title, String prize, int requiredHours, int participants,
                            boolean joined) {}

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    private final List<Giveaway> cache = new ArrayList<>();

    public GiveawayNotifier(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    /** Периодическое напоминание всем, кто в сети. */
    public void broadcast() {
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            if (!plugin.auth().authenticated(player)) continue;
            show(player, false);
        }
    }

    /**
     * Показывает игроку активные розыгрыши. quiet=true — молчим, если их нет:
     * так приветствие при входе не мусорит чат лишней строкой.
     */
    public void show(Player player, boolean verbose) {
        plugin.api().onMain(
                plugin.api().get("/api/mc/giveaways?login=" + Accounts.name(player)),
                response -> {
                    if (!player.isOnline() || response.get("_status").getAsInt() != 200) return;

                    double hours = response.has("hours") && !response.get("hours").isJsonNull()
                            ? response.get("hours").getAsDouble()
                            : 0.0;
                    JsonArray items = response.getAsJsonArray("giveaways");

                    if (items.isEmpty()) {
                        if (verbose) player.sendMessage(messages.get("giveaway.none"));
                        return;
                    }

                    cache.clear();
                    player.sendMessage(messages.get("giveaway.header"));

                    for (int i = 0; i < items.size(); i++) {
                        JsonObject item = items.get(i).getAsJsonObject();
                        Giveaway giveaway = new Giveaway(
                                item.get("title").getAsString(),
                                item.get("prize").getAsString(),
                                item.get("requiredHours").getAsInt(),
                                item.get("participants").getAsInt(),
                                item.get("joined").getAsBoolean());
                        cache.add(giveaway);

                        player.sendMessage(messages.get("giveaway.line", Map.of(
                                "title", giveaway.title(),
                                "prize", giveaway.prize(),
                                "required", String.valueOf(giveaway.requiredHours()),
                                "players", String.valueOf(giveaway.participants()))));

                        Component status = giveaway.joined()
                                ? messages.get("giveaway.joined", Map.of("hours", format(hours)))
                                : hours >= giveaway.requiredHours()
                                        ? messages.get("giveaway.ready", Map.of(
                                                "hours", format(hours),
                                                "url", plugin.config().siteUrl + "/giveaways"))
                                        : messages.get("giveaway.progress", Map.of(
                                                "hours", format(hours),
                                                "required", String.valueOf(giveaway.requiredHours()),
                                                "left", format(giveaway.requiredHours() - hours)));
                        player.sendMessage(status);
                    }
                });
    }

    private String format(double hours) {
        return String.format(java.util.Locale.ROOT, "%.1f", Math.max(0, hours));
    }
}
