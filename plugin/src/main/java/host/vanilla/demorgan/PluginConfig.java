package host.vanilla.demorgan;

import org.bukkit.Material;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/** Разобранный config.yml — читается один раз при старте и на /demorgan reload. */
public final class PluginConfig {

    public final String worldName;
    public final boolean autoCreate;
    public final int size;
    public final int height;
    public final int floorY;
    public final Material mineMaterial;
    public final int regenSeconds;
    public final Material tool;

    public final int secondsPerBlock;
    public final List<Integer> escalation;
    public final int maxMinutes;

    public final Set<String> allowedCommands;
    public final boolean isolateChat;
    public final boolean invulnerable;

    public final int saveIntervalSeconds;
    public final String webhookUrl;

    public PluginConfig(FileConfiguration c) {
        worldName = c.getString("zone.world", "demorgan");
        autoCreate = c.getBoolean("zone.auto-create", true);
        size = Math.max(8, c.getInt("zone.size", 24));
        height = Math.max(4, c.getInt("zone.height", 6));
        floorY = c.getInt("zone.floor-y", 64);
        mineMaterial = material(c.getString("zone.mine-material"), Material.STONE);
        regenSeconds = Math.max(1, c.getInt("zone.regen-seconds", 5));
        tool = material(c.getString("zone.tool"), Material.IRON_PICKAXE);

        secondsPerBlock = Math.max(0, c.getInt("sentence.seconds-per-block", 2));
        List<Integer> raw = c.getIntegerList("sentence.escalation");
        escalation = raw.isEmpty() ? List.of(30, 120, 360) : List.copyOf(raw);
        maxMinutes = Math.max(1, c.getInt("sentence.max-minutes", 1440));

        allowedCommands = c.getStringList("restrictions.allowed-commands").stream()
                .map(s -> s.toLowerCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
        isolateChat = c.getBoolean("restrictions.isolate-chat", true);
        invulnerable = c.getBoolean("restrictions.invulnerable", true);

        saveIntervalSeconds = Math.max(10, c.getInt("storage.save-interval-seconds", 60));
        webhookUrl = c.getString("discord.webhook-url", "").trim();
    }

    /** Срок в минутах для игрока, у которого уже есть {@code previousOffences} нарушений. */
    public int escalatedMinutes(int previousOffences) {
        int index = Math.min(previousOffences, escalation.size() - 1);
        return escalation.get(Math.max(0, index));
    }

    private static Material material(String name, Material fallback) {
        if (name == null) return fallback;
        Material m = Material.matchMaterial(name);
        return m == null ? fallback : m;
    }
}
