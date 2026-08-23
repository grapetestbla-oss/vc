package host.vanilla.core.config;

import org.bukkit.Material;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/** Разобранный config.yml. */
public final class PluginConfig {

    public final String apiUrl;
    public final String apiToken;

    public final int authTimeoutSeconds;
    public final int maxLoginAttempts;

    public final String jailWorld;
    public final boolean jailAutoCreate;
    public final int jailSize;
    public final int jailHeight;
    public final int jailFloorY;
    public final Material jailMineMaterial;
    public final int jailRegenSeconds;
    public final Material jailTool;
    public final int jailTimeRatio;
    public final int jailSecondsPerBlock;
    public final int jailSyncSeconds;
    public final boolean jailIsolateChat;
    public final Set<String> jailAllowedCommands;

    public final boolean staffAlwaysSpectator;
    public final int espRefreshSeconds;

    public PluginConfig(FileConfiguration c) {
        apiUrl = c.getString("api.url", "http://127.0.0.1:3000");
        apiToken = c.getString("api.token", "");

        authTimeoutSeconds = Math.max(15, c.getInt("auth.timeout-seconds", 60));
        maxLoginAttempts = Math.max(1, c.getInt("auth.max-attempts", 3));

        jailWorld = c.getString("jail.world", "demorgan");
        jailAutoCreate = c.getBoolean("jail.auto-create", true);
        jailSize = Math.max(8, c.getInt("jail.size", 24));
        jailHeight = Math.max(4, c.getInt("jail.height", 6));
        jailFloorY = c.getInt("jail.floor-y", 64);
        jailMineMaterial = material(c.getString("jail.mine-material"), Material.STONE);
        jailRegenSeconds = Math.max(1, c.getInt("jail.regen-seconds", 5));
        jailTool = material(c.getString("jail.tool"), Material.IRON_PICKAXE);
        jailTimeRatio = Math.max(1, c.getInt("jail.time-ratio", 10));
        jailSecondsPerBlock = Math.max(0, c.getInt("jail.seconds-per-block", 20));
        jailSyncSeconds = Math.max(10, c.getInt("jail.sync-seconds", 30));
        jailIsolateChat = c.getBoolean("jail.isolate-chat", true);
        jailAllowedCommands = c.getStringList("jail.allowed-commands").stream()
                .map(s -> s.toLowerCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());

        staffAlwaysSpectator = c.getBoolean("staff.always-spectator", true);
        espRefreshSeconds = Math.max(2, c.getInt("staff.esp-refresh-seconds", 5));
    }

    private static Material material(String name, Material fallback) {
        if (name == null) return fallback;
        Material material = Material.matchMaterial(name);
        return material == null ? fallback : material;
    }

    public List<String> validate() {
        return apiToken.isBlank()
                ? List.of("api.token пуст — плагин не сможет авторизовать игроков")
                : List.of();
    }
}
