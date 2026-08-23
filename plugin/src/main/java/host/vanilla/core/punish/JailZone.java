package host.vanilla.core.punish;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.config.PluginConfig;
import org.bukkit.Difficulty;
import org.bukkit.GameRule;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.WorldCreator;
import org.bukkit.block.Block;
import org.bukkit.generator.ChunkGenerator;

/** Арена деморгана: изолированный мир, стены из барьеров, породная стенка. */
public final class JailZone {

    /** Пустой мир: всё, что в нём есть, ставит сам плагин. */
    public static final class VoidGenerator extends ChunkGenerator {
        @Override public boolean shouldGenerateNoise() { return false; }
        @Override public boolean shouldGenerateSurface() { return false; }
        @Override public boolean shouldGenerateCaves() { return false; }
        @Override public boolean shouldGenerateDecorations() { return false; }
        @Override public boolean shouldGenerateMobs() { return false; }
        @Override public boolean shouldGenerateStructures() { return false; }
    }

    private final VanillaCorePlugin plugin;
    private final PluginConfig config;
    private World world;

    public JailZone(VanillaCorePlugin plugin, PluginConfig config) {
        this.plugin = plugin;
        this.config = config;
    }

    public World world() {
        return world;
    }

    public void prepare() {
        world = plugin.getServer().getWorld(config.jailWorld);
        if (world == null) {
            if (!config.jailAutoCreate) {
                plugin.getLogger().warning("Мир деморгана не найден, автосоздание выключено.");
                return;
            }
            world = new WorldCreator(config.jailWorld).generator(new VoidGenerator()).createWorld();
        }
        if (world == null) {
            plugin.getLogger().severe("Не удалось создать мир деморгана.");
            return;
        }
        applyRules();
        if (config.jailAutoCreate) build();
    }

    private void applyRules() {
        world.setDifficulty(Difficulty.PEACEFUL);
        world.setGameRule(GameRule.DO_MOB_SPAWNING, false);
        world.setGameRule(GameRule.DO_DAYLIGHT_CYCLE, false);
        world.setGameRule(GameRule.DO_WEATHER_CYCLE, false);
        world.setGameRule(GameRule.KEEP_INVENTORY, true);
        world.setGameRule(GameRule.DO_FIRE_TICK, false);
        world.setGameRule(GameRule.FALL_DAMAGE, false);
        world.setTime(6000L);
        world.setSpawnLocation(0, config.jailFloorY + 1, 0);
    }

    /** Идемпотентно: гоняется при каждом старте и чинит арену. */
    private void build() {
        int half = config.jailSize / 2;
        int floor = config.jailFloorY;
        int ceiling = floor + config.jailHeight;

        for (int x = -half; x <= half; x++) {
            for (int z = -half; z <= half; z++) {
                world.getBlockAt(x, floor, z).setType(Material.BEDROCK, false);
                world.getBlockAt(x, ceiling, z).setType(Material.BARRIER, false);

                boolean wall = Math.abs(x) == half || Math.abs(z) == half;
                boolean face = Math.abs(x) == half - 1 || Math.abs(z) == half - 1;

                for (int y = floor + 1; y < ceiling; y++) {
                    Block block = world.getBlockAt(x, y, z);
                    if (wall) {
                        block.setType(Material.BARRIER, false);
                    } else if (face && y <= floor + 3) {
                        // Стенка породы: игрок стоит на полу и бьёт её, а не внутри неё.
                        block.setType(config.jailMineMaterial, false);
                    } else if (block.getType() != Material.AIR) {
                        block.setType(Material.AIR, false);
                    }
                }
            }
        }
        world.getBlockAt(0, ceiling - 1, 0).setType(Material.GLOWSTONE, false);
        plugin.getLogger().info("Арена деморгана готова.");
    }

    public Location spawn() {
        World target = world != null ? world : plugin.getServer().getWorlds().get(0);
        return new Location(target, 0.5, config.jailFloorY + 1, 0.5);
    }

    public boolean isInside(Location location) {
        if (world == null || location.getWorld() == null) return false;
        if (!location.getWorld().getUID().equals(world.getUID())) return false;
        int half = config.jailSize / 2;
        return Math.abs(location.getBlockX()) < half
                && Math.abs(location.getBlockZ()) < half
                && location.getY() >= config.jailFloorY
                && location.getY() <= config.jailFloorY + config.jailHeight;
    }

    public boolean isMineBlock(Block block) {
        return block.getType() == config.jailMineMaterial && isInside(block.getLocation());
    }
}
