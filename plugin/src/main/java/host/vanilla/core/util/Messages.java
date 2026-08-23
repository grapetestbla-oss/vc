package host.vanilla.core.util;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.Map;

/** Сообщения из config.yml с подстановкой плейсхолдеров вида &lt;player&gt;. */
public final class Messages {

    private static final MiniMessage MM = MiniMessage.miniMessage();

    private final FileConfiguration config;
    private String prefix;

    public Messages(FileConfiguration config) {
        this.config = config;
        this.prefix = config.getString("messages.prefix", "");
    }

    public void reload() {
        prefix = config.getString("messages.prefix", "");
    }

    public Component get(String key, Map<String, String> placeholders) {
        return MM.deserialize(prefix + raw(key, placeholders));
    }

    public Component get(String key) {
        return get(key, Map.of());
    }

    public Component plain(String key, Map<String, String> placeholders) {
        return MM.deserialize(raw(key, placeholders));
    }

    public static Component mm(String text) {
        return MM.deserialize(text);
    }

    private String raw(String key, Map<String, String> placeholders) {
        String text = config.getString("messages." + key, key);
        for (Map.Entry<String, String> entry : placeholders.entrySet()) {
            text = text.replace("<" + entry.getKey() + ">", escape(entry.getValue()));
        }
        return text;
    }

    /** Ники и причины приходят от людей — не даём протащить свои теги. */
    private static String escape(String value) {
        return value == null ? "" : value.replace("<", "\\<");
    }

    public static String formatTime(int seconds) {
        int h = seconds / 3600;
        int m = (seconds % 3600) / 60;
        int s = seconds % 60;
        if (h > 0) return h + " ч " + m + " мин";
        if (m > 0) return m + " мин " + s + " сек";
        return s + " сек";
    }
}
