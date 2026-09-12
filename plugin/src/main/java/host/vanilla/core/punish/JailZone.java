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

    /**
     * Идемпотентно: гоняется при каждом старте и чинит арену.
     *
     * Раньше порода стояла кольцом в три блока высотой у самой стены — её
     * просто не находили: заключённый бил барьеры и бедрок, получал «здесь
     * ломать нельзя» и решал, что работа сломана. Теперь половину зала
     * занимает сплошной забой от пола до потолка, промахнуться мимо него
     * нельзя.
     *
     * Ломается только порода: стены и потолок сделаны из другого материала, а
     * проверка ломки пропускает ровно jail.mine-material — значит декор можно
     * ставить любой, прокопаться сквозь него не выйдет.
     */
    private void build() {
        int half = config.jailSize / 2;
        int floor = config.jailFloorY;
        int ceiling = floor + config.jailHeight;
        // Забой занимает дальнюю половину зала, двор — ближнюю.
        int faceEdge = 1;

        for (int x = -half; x <= half; x++) {
            for (int z = -half; z <= half; z++) {
                world.getBlockAt(x, floor, z).setType(Material.BEDROCK, false);

                boolean wall = Math.abs(x) == half || Math.abs(z) == half;
                for (int y = floor + 1; y <= ceiling; y++) {
                    Block block = world.getBlockAt(x, y, z);

                    if (wall || y == ceiling) {
                        block.setType(wallMaterial(x, y, z, floor, ceiling), false);
                        continue;
                    }
                    if (z >= faceEdge) {
                        // Сплошной забой: копай куда хочешь, порода не кончится.
                        block.setType(config.jailMineMaterial, false);
                        continue;
                    }
                    if (block.getType() != Material.AIR) block.setType(Material.AIR, false);
                }
            }
        }

        decorate(half, floor, ceiling, faceEdge);
        plugin.getLogger().info("Арена деморгана готова.");
    }

    /** Стены и потолок: тёмный камень с прожилками, чтобы это была шахта. */
    private Material wallMaterial(int x, int y, int z, int floor, int ceiling) {
        if (y == ceiling) return Material.POLISHED_DEEPSLATE;
        if (y == floor + 1) return Material.DEEPSLATE_TILES;
        // Простая раскладка без случайности: арена чинится при каждом старте, и
        // случайный узор перекладывался бы заново каждый раз.
        return ((x + z + y) & 3) == 0 ? Material.CRACKED_DEEPSLATE_BRICKS : Material.DEEPSLATE_BRICKS;
    }

    /** Свет, рельсы и пара мелочей: двор должен выглядеть обжитым. */
    private void decorate(int half, int floor, int ceiling, int faceEdge) {
        int inner = half - 1;

        // Фонари под потолком по периметру двора.
        for (int x = -inner + 2; x <= inner - 2; x += 4) {
            lamp(x, ceiling - 1, -inner);
        }
        for (int z = -inner; z < faceEdge; z += 4) {
            lamp(-inner, ceiling - 1, z);
            lamp(inner, ceiling - 1, z);
        }

        // Рельсы от двора к забою: видно, куда идти работать.
        for (int z = -inner + 1; z < faceEdge; z++) {
            world.getBlockAt(0, floor + 1, z).setType(Material.RAIL, false);
        }

        // Немного инвентаря у стены — просто чтобы двор не был пустой коробкой.
        world.getBlockAt(-inner + 1, floor + 1, -inner + 1).setType(Material.BARREL, false);
        world.getBlockAt(-inner + 2, floor + 1, -inner + 1).setType(Material.BARREL, false);
        world.getBlockAt(inner - 1, floor + 1, -inner + 1).setType(Material.ANVIL, false);
        world.getBlockAt(inner - 2, floor + 1, -inner + 1).setType(Material.CAULDRON, false);
    }

    private void lamp(int x, int y, int z) {
        world.getBlockAt(x, y, z).setType(Material.SHROOMLIGHT, false);
    }

    public Location spawn() {
        // Мир мог не создаться при запуске (или его снесли) — пробуем ещё раз,
        // иначе игрока «посадят» в обычный мир и он этого даже не заметит.
        if (world == null) prepare();
        if (world == null) {
            plugin.getLogger().severe("Мир деморгана недоступен: сажаем в обычный мир.");
            return plugin.getServer().getWorlds().get(0).getSpawnLocation();
        }
        // Ставим во дворе, спиной к забою: в самом забое стоять негде.
        int yard = -(config.jailSize / 2) + 3;
        return new Location(world, 0.5, config.jailFloorY + 1, yard + 0.5, 0f, 0f);
    }

    public boolean isInside(Location location) {
        if (world == null || location.getWorld() == null) return false;
        if (!location.getWorld().getUID().equals(world.getUID())) return false;
        int half = config.jailSize / 2;
        return Math.abs(location.getBlockX()) < half
                && Math.abs(location.getBlockZ()) < half
                && location.getBlockY() > config.jailFloorY
                && location.getBlockY() < config.jailFloorY + config.jailHeight;
    }

    public boolean isMineBlock(Block block) {
        return block.getType() == config.jailMineMaterial && isInside(block.getLocation());
    }
}
