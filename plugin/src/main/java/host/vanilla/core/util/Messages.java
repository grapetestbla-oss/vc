package host.vanilla.core.util;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Сообщения из config.yml с подстановкой плейсхолдеров вида &lt;player&gt;. */
public final class Messages {

    private static final MiniMessage MM = MiniMessage.miniMessage();

    private final JavaPlugin plugin;
    private final FileConfiguration config;
    /**
     * config.yml из самого jar. Bukkit не дописывает новые ключи в уже
     * созданный файл на сервере, а getString(path, default) не заглядывает в
     * значения по умолчанию — без этого запаса после обновления плагина в чат
     * летели служебные ключи вида «giveaway.none».
     */
    private final FileConfiguration bundled;
    private final Set<String> reported = new HashSet<>();
    private String prefix;

    public Messages(JavaPlugin plugin) {
        this.plugin = plugin;
        this.config = plugin.getConfig();
        this.bundled = loadBundled(plugin);
        this.prefix = lookup("prefix", "");
    }

    private static FileConfiguration loadBundled(JavaPlugin plugin) {
        InputStream stream = plugin.getResource("config.yml");
        if (stream == null) return new YamlConfiguration();
        try (InputStreamReader reader = new InputStreamReader(stream, StandardCharsets.UTF_8)) {
            return YamlConfiguration.loadConfiguration(reader);
        } catch (Exception e) {
            return new YamlConfiguration();
        }
    }

    public void reload() {
        prefix = lookup("prefix", "");
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

    /** Значение из config.yml сервера, иначе из jar, иначе — то, что дали. */
    private String lookup(String key, String fallback) {
        String value = config.getString("messages." + key);
        if (value == null) value = bundled.getString("messages." + key);
        return value == null ? fallback : value;
    }

    private String raw(String key, Map<String, String> placeholders) {
        String text = config.getString("messages." + key);
        if (text == null) text = bundled.getString("messages." + key);
        if (text == null) {
            // Ключа нет нигде — это ошибка в плагине. Игроку показываем
            // нейтральную строку, а в консоль пишем один раз, что чинить.
            if (reported.add(key)) {
                plugin.getLogger().warning("Нет текста для сообщения '" + key + "' в config.yml");
            }
            text = "<gray>…</gray>";
        }
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
