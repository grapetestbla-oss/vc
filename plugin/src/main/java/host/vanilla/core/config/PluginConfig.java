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
    /// Адрес сайта для ссылок в чате — обычно совпадает с apiUrl.
    public final String siteUrl;

    /// Префикс, который Floodgate добавляет никам Bedrock-игроков.
    public final String bedrockPrefix;
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
    /// Запрещать администрации ломать и ставить блоки даже в выживании.
    public final boolean staffProtectWorld;
    public final int espRefreshSeconds;
    public final int newsPollSeconds;
    public final int maintenancePollSeconds;
    /// Как часто напоминать о розыгрышах. 0 — не напоминать.
    public final int giveawayNotifySeconds;
    /// На каком расстоянии игроки могут играть в кости.
    public final int diceRadius;

    /// Как часто перечитывать надетую косметику с сайта. 0 — не перечитывать.
    public final int cosmeticRefreshSeconds;

    /// Название сезона в списке игроков и в приветствии.
    public final String seasonName;
    public final boolean tabEnabled;
    public final int tabRefreshSeconds;

    public final boolean sparkEnabled;
    public final int sparkIntervalSeconds;
    public final int sparkMaxActive;
    public final int sparkLifetimeSeconds;
    public final int sparkMinDistance;
    public final int sparkMaxDistance;
    public final double sparkClaimRadius;
    public final boolean sparkAnnounce;
    public final int sparkAnnounceRadius;
    public final double sparkVcChance;
    public final int sparkVcMin;
    public final int sparkVcMax;
    public final int sparkShardsMin;
    public final int sparkShardsMax;

    public PluginConfig(FileConfiguration c) {
        apiUrl = c.getString("api.url", "http://127.0.0.1:3000");
        apiToken = c.getString("api.token", "");
        siteUrl = c.getString("api.site-url", apiUrl);

        bedrockPrefix = c.getString("auth.bedrock-prefix", ".");
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
        staffProtectWorld = c.getBoolean("staff.protect-world", false);
        espRefreshSeconds = Math.max(2, c.getInt("staff.esp-refresh-seconds", 5));
        newsPollSeconds = Math.max(30, c.getInt("news.poll-seconds", 60));
        maintenancePollSeconds = Math.max(5, c.getInt("maintenance.poll-seconds", 10));
        giveawayNotifySeconds = Math.max(0, c.getInt("giveaway.notify-seconds", 900));
        diceRadius = Math.max(3, Math.min(32, c.getInt("dice.radius", 8)));

        int cosmeticRefresh = c.getInt("cosmetics.refresh-seconds", 45);
        cosmeticRefreshSeconds = cosmeticRefresh <= 0 ? 0 : Math.max(10, cosmeticRefresh);

        seasonName = c.getString("season.name", "Season I");
        tabEnabled = c.getBoolean("season.tab-enabled", true);
        tabRefreshSeconds = Math.max(1, c.getInt("season.tab-refresh-seconds", 3));

        sparkEnabled = c.getBoolean("season.sparks.enabled", true);
        sparkIntervalSeconds = Math.max(30, c.getInt("season.sparks.interval-seconds", 420));
        sparkMaxActive = Math.max(1, c.getInt("season.sparks.max-active", 3));
        sparkLifetimeSeconds = Math.max(30, c.getInt("season.sparks.lifetime-seconds", 240));
        sparkMinDistance = Math.max(8, c.getInt("season.sparks.min-distance", 25));
        sparkMaxDistance = Math.max(sparkMinDistance + 1, c.getInt("season.sparks.max-distance", 70));
        sparkClaimRadius = Math.max(0.8, c.getDouble("season.sparks.claim-radius", 1.6));
        sparkAnnounce = c.getBoolean("season.sparks.announce", true);
        sparkAnnounceRadius = Math.max(16, c.getInt("season.sparks.announce-radius", 250));
        sparkVcChance = Math.min(1.0, Math.max(0.0, c.getDouble("season.sparks.vc-chance", 0.45)));
        sparkVcMin = Math.max(1, c.getInt("season.sparks.vc-min", 5));
        sparkVcMax = Math.max(sparkVcMin, c.getInt("season.sparks.vc-max", 250));
        sparkShardsMin = Math.max(1, c.getInt("season.sparks.shards-min", 25));
        sparkShardsMax = Math.max(sparkShardsMin, c.getInt("season.sparks.shards-max", 500));
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
