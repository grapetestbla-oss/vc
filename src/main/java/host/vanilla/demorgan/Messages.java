package host.vanilla.demorgan;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.Map;

/** Сообщения из config.yml с подстановкой плейсхолдеров вида &lt;player&gt;. */
public final class Messages {

    private static final MiniMessage MM = MiniMessage.miniMessage();

    private final FileConfiguration config;
    private final String prefix;

    public Messages(FileConfiguration config) {
        this.config = config;
        this.prefix = config.getString("messages.prefix", "");
    }

    public Component get(String key, Map<String, String> placeholders) {
        return MM.deserialize(prefix + raw(key, placeholders));
    }

    public Component get(String key) {
        return get(key, Map.of());
    }

    /** Без префикса — для actionbar и подобного. */
    public Component plain(String key, Map<String, String> placeholders) {
        return MM.deserialize(raw(key, placeholders));
    }

    private String raw(String key, Map<String, String> placeholders) {
        String text = config.getString("messages." + key, key);
        for (Map.Entry<String, String> e : placeholders.entrySet()) {
            text = text.replace("<" + e.getKey() + ">", escape(e.getValue()));
        }
        return text;
    }

    /** Причина и ники приходят от людей — не даём им протащить свои теги. */
    private static String escape(String value) {
        return value.replace("<", "\\<");
    }

    /** 3600 -> "1 ч 0 мин", 90 -> "1 мин 30 сек" */
    public static String formatTime(int seconds) {
        int h = seconds / 3600;
        int m = (seconds % 3600) / 60;
        int s = seconds % 60;
        if (h > 0) return h + " ч " + m + " мин";
        if (m > 0) return m + " мин " + s + " сек";
        return s + " сек";
    }
}
