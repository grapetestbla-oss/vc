package host.vanilla.core.news;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Новости, отмеченные на сайте как «объявить в игре», приходят сюда.
 * Доставку подтверждаем отдельным запросом: объявление не потеряется при
 * рестарте сервера и не повторится дважды.
 */
public final class NewsBroadcaster {

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    public NewsBroadcaster(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    public void poll() {
        if (Bukkit.getOnlinePlayers().isEmpty()) return; // некому объявлять — придём позже

        plugin.api().onMain(plugin.api().get("/api/mc/news"), response -> {
            if (response.get("_status").getAsInt() != 200 || !response.has("news")) return;

            JsonArray items = response.getAsJsonArray("news");
            List<String> delivered = new ArrayList<>();

            for (int i = 0; i < items.size(); i++) {
                JsonObject item = items.get(i).getAsJsonObject();
                announce(item.get("title").getAsString(),
                        item.get("summary").getAsString(),
                        item.get("slug").getAsString());
                delivered.add(item.get("id").getAsString());
            }

            if (!delivered.isEmpty()) {
                plugin.api().post("/api/mc/news", Map.of("ids", delivered));
            }
        });
    }

    private void announce(String title, String summary, String slug) {
        Component header = messages.get("news.header", Map.of("title", title));
        Component text = messages.plain("news.text", Map.of("text", summary));
        Component link = Component.text("Читать на сайте →", NamedTextColor.AQUA)
                .clickEvent(ClickEvent.openUrl(plugin.config().siteUrl + "/news/" + slug));

        for (Player player : Bukkit.getOnlinePlayers()) {
            if (!plugin.auth().authenticated(player)) continue;
            player.sendMessage(header);
            player.sendMessage(text);
            player.sendMessage(link);
        }
    }
}
