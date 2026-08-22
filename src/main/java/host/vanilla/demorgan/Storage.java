package host.vanilla.demorgan;

import org.bukkit.Location;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;

/** Хранилище состояния в data.yml. Данных мало, отдельная БД тут не окупается. */
public final class Storage {

    private final DemorganPlugin plugin;
    private final File file;

    public Storage(DemorganPlugin plugin) {
        this.plugin = plugin;
        this.file = new File(plugin.getDataFolder(), "data.yml");
    }

    public record Data(Map<UUID, Punishment> active, Map<UUID, Integer> history) {}

    public Data load() {
        Map<UUID, Punishment> active = new HashMap<>();
        Map<UUID, Integer> history = new HashMap<>();
        if (!file.exists()) {
            return new Data(active, history);
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);

        ConfigurationSection activeSection = yaml.getConfigurationSection("active");
        if (activeSection != null) {
            for (String key : activeSection.getKeys(false)) {
                try {
                    UUID uuid = UUID.fromString(key);
                    ConfigurationSection s = activeSection.getConfigurationSection(key);
                    if (s == null) continue;
                    active.put(uuid, new Punishment(
                            uuid,
                            s.getString("name", key),
                            s.getString("reason", "—"),
                            s.getString("issued-by", "console"),
                            s.getLong("issued-at", System.currentTimeMillis()),
                            s.getInt("total-seconds", 0),
                            s.getInt("remaining-seconds", 0),
                            s.getInt("blocks-mined", 0),
                            (Location) s.get("return-location"),
                            s.getString("inventory")));
                } catch (IllegalArgumentException e) {
                    plugin.getLogger().warning("Пропущена битая запись в data.yml: " + key);
                }
            }
        }

        ConfigurationSection historySection = yaml.getConfigurationSection("history");
        if (historySection != null) {
            for (String key : historySection.getKeys(false)) {
                try {
                    history.put(UUID.fromString(key), historySection.getInt(key));
                } catch (IllegalArgumentException ignored) {
                    // битый ключ истории — не повод падать
                }
            }
        }
        return new Data(active, history);
    }

    public void save(Map<UUID, Punishment> active, Map<UUID, Integer> history) {
        YamlConfiguration yaml = new YamlConfiguration();
        for (Punishment p : active.values()) {
            String path = "active." + p.uuid();
            yaml.set(path + ".name", p.name());
            yaml.set(path + ".reason", p.reason());
            yaml.set(path + ".issued-by", p.issuedBy());
            yaml.set(path + ".issued-at", p.issuedAt());
            yaml.set(path + ".total-seconds", p.totalSeconds());
            yaml.set(path + ".remaining-seconds", p.remainingSeconds());
            yaml.set(path + ".blocks-mined", p.blocksMined());
            yaml.set(path + ".return-location", p.returnLocation());
            yaml.set(path + ".inventory", p.inventoryData());
        }
        for (Map.Entry<UUID, Integer> e : history.entrySet()) {
            yaml.set("history." + e.getKey(), e.getValue());
        }
        try {
            if (!plugin.getDataFolder().exists() && !plugin.getDataFolder().mkdirs()) {
                plugin.getLogger().warning("Не удалось создать папку плагина.");
            }
            yaml.save(file);
        } catch (IOException e) {
            plugin.getLogger().log(Level.SEVERE, "Не удалось сохранить data.yml", e);
        }
    }
}
