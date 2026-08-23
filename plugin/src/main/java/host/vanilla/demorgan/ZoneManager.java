package host.vanilla.demorgan;

import org.bukkit.Difficulty;
import org.bukkit.GameRule;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.WorldCreator;
import org.bukkit.block.Block;

/** Арена деморгана: изолированный мир, стены из барьеров, породная стенка для отработки. */
public final class ZoneManager {

    private final DemorganPlugin plugin;
    private final PluginConfig config;
    private World world;

    public ZoneManager(DemorganPlugin plugin, PluginConfig config) {
        this.plugin = plugin;
        this.config = config;
    }

    public World world() {
        return world;
    }

    /** Вызывается в onEnable: создаёт мир и (пере)строит арену. */
    public void prepare() {
        world = plugin.getServer().getWorld(config.worldName);
        if (world == null) {
            if (!config.autoCreate) {
                plugin.getLogger().warning("Мир '" + config.worldName + "' не найден, а auto-create выключен. "
                        + "Деморган работать не будет.");
                return;
            }
            world = new WorldCreator(config.worldName)
                    .generator(new VoidGenerator())
                    .createWorld();
        }
        if (world == null) {
            plugin.getLogger().severe("Не удалось создать мир деморгана.");
            return;
        }
        applyWorldRules();
        if (config.autoCreate) {
            buildArena();
        }
    }

    private void applyWorldRules() {
        world.setDifficulty(Difficulty.PEACEFUL);
        world.setGameRule(GameRule.DO_MOB_SPAWNING, false);
        world.setGameRule(GameRule.DO_DAYLIGHT_CYCLE, false);
        world.setGameRule(GameRule.DO_WEATHER_CYCLE, false);
        world.setGameRule(GameRule.KEEP_INVENTORY, true);
        world.setGameRule(GameRule.DO_FIRE_TICK, false);
        world.setGameRule(GameRule.FALL_DAMAGE, false);
        world.setGameRule(GameRule.ANNOUNCE_ADVANCEMENTS, false);
        world.setTime(6000L);
        world.setSpawnLocation(0, config.floorY + 1, 0);
    }

    /** Идемпотентно: гоняется при каждом старте и чинит арену, если её поломали. */
    private void buildArena() {
        int half = config.size / 2;
        int floor = config.floorY;
        int ceiling = floor + config.height;

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
                        // Стенка породы: игрок стоит на полу и бьёт её, а не стоит внутри неё.
                        block.setType(config.mineMaterial, false);
                    } else if (block.getType() != Material.AIR) {
                        block.setType(Material.AIR, false);
                    }
                }
            }
        }
        // Свет, чтобы не работать в темноте.
        world.getBlockAt(0, ceiling - 1, 0).setType(Material.GLOWSTONE, false);
        plugin.getLogger().info("Арена деморгана готова: мир '" + config.worldName + "', размер " + config.size + ".");
    }

    public Location spawnLocation() {
        World w = world != null ? world : plugin.getServer().getWorlds().get(0);
        return new Location(w, 0.5, config.floorY + 1, 0.5);
    }

    public boolean isInside(Location loc) {
        if (world == null || loc.getWorld() == null) return false;
        if (!loc.getWorld().getUID().equals(world.getUID())) return false;
        int half = config.size / 2;
        return Math.abs(loc.getBlockX()) < half
                && Math.abs(loc.getBlockZ()) < half
                && loc.getY() >= config.floorY
                && loc.getY() <= config.floorY + config.height;
    }

    /** Порода, за которую засчитывается отработка. */
    public boolean isMineBlock(Block block) {
        return block.getType() == config.mineMaterial && isInside(block.getLocation());
    }
}
