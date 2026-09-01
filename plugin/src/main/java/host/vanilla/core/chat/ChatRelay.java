package host.vanilla.core.chat;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Пересылка игрового чата в Telegram.
 *
 * Копим строки и отправляем пачкой раз в несколько секунд, а не по одной:
 * Telegram ограничивает частоту сообщений в группу примерно двадцатью в минуту,
 * и живой чат этот лимит выбьет за полминуты. Пачка уходит одним запросом и
 * одним сообщением.
 *
 * Тем же запросом забираем обратную сторону: ответы, написанные в Telegram на
 * пересланное сообщение. Один таймер вместо двух.
 *
 * Токен бота живёт на сайте, поэтому шлём туда — плагин только собирает.
 */
public final class ChatRelay {

    /**
     * Сколько строк держим, если сайт не отвечает. Дальше выбрасываем самые
     * старые: очередь не должна расти в память бесконечно.
     */
    private static final int MAX_BUFFERED = 300;
    /** За раз отправляем не больше — иначе сообщение не влезет в Telegram. */
    private static final int MAX_PER_FLUSH = 40;

    private final VanillaCorePlugin plugin;
    private final ConcurrentLinkedQueue<Map<String, String>> queue = new ConcurrentLinkedQueue<>();

    public ChatRelay(VanillaCorePlugin plugin) {
        this.plugin = plugin;
    }

    /** Вызывается из чата, в том числе из асинхронного потока. */
    public void add(String player, String text) {
        if (!plugin.config().chatRelayEnabled) return;

        Map<String, String> line = new LinkedHashMap<>();
        line.put("player", player);
        line.put("text", text);
        queue.add(line);

        while (queue.size() > MAX_BUFFERED) queue.poll();
    }

    /**
     * Отправка накопленного и приём ответов. Ходим по таймеру даже с пустой
     * очередью: этим же запросом забираем то, что написали в Telegram.
     */
    public void flush() {
        if (!plugin.config().chatRelayEnabled) return;

        List<Map<String, String>> batch = new ArrayList<>();
        for (int i = 0; i < MAX_PER_FLUSH; i++) {
            Map<String, String> line = queue.poll();
            if (line == null) break;
            batch.add(line);
        }

        plugin.api().onMain(plugin.api().post("/api/mc/chat", Map.of("lines", batch)), response -> {
            if (response.get("_status").getAsInt() != 200) {
                // Строки в очередь не возвращаем: при недоступном сайте они
                // копились бы кругами и всё равно выпали бы по лимиту.
                plugin.getLogger().warning("Чат не ушёл в Telegram: " + response);
                return;
            }
            if (response.has("incoming") && response.get("incoming").isJsonArray()) {
                show(response.getAsJsonArray("incoming"));
            }
        });
    }

    /** Показывает ответы из Telegram всем в игре. */
    private void show(JsonArray incoming) {
        for (int i = 0; i < incoming.size(); i++) {
            JsonObject item = incoming.get(i).getAsJsonObject();
            String author = item.has("author") ? item.get("author").getAsString() : "гость";
            String text = item.has("text") ? item.get("text").getAsString() : "";
            if (text.isBlank()) continue;

            var message = plugin.messages().get("chat.from-telegram", Map.of(
                    "author", author, "text", text));
            for (Player player : plugin.getServer().getOnlinePlayers()) {
                player.sendMessage(message);
            }
            plugin.getServer().getConsoleSender().sendMessage(message);
        }
    }
}
