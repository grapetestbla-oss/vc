package host.vanilla.core.admin;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import org.bukkit.Chunk;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.world.ChunkLoadEvent;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.logging.Level;

/**
 * Ловушечная руда против X-Ray.
 *
 * В камне прячется руда, к которой нет ни одного открытого подхода: со всех
 * сторон сплошной камень, ни воздуха, ни воды, ни пещеры рядом. Увидеть её
 * обычными глазами нельзя — значит и прокопаться прямо к ней просто так не
 * выйдет. Кто выкопал, тот смотрел сквозь камень.
 *
 * Слово «просто так» здесь не для красоты: случайный штрек всё-таки может
 * пройти через ловушку, поэтому плагин никого не наказывает, а показывает
 * администрации сработку с числом попаданий за сессию — по одному попаданию не
 * судят, по трём подряд вопросов уже не остаётся.
 *
 * Положения ловушек хранятся в файле рядом с конфигом: без этого после
 * перезапуска в мире остались бы забытые алмазы, которые кто-нибудь однажды
 * выкопал бы честно и попал под подозрение.
 */
public final class XrayTraps implements Listener {

    /** Что прячем. Дешёвую руду X-Ray обычно не ищет. */
    private static final List<Material> ORES = List.of(
            Material.DIAMOND_ORE, Material.DEEPSLATE_DIAMOND_ORE, Material.ANCIENT_DEBRIS);

    /** Во что можно прятать: только сплошная порода. */
    private static final Set<Material> HOST = Set.of(
            Material.STONE, Material.DEEPSLATE, Material.TUFF, Material.ANDESITE,
            Material.DIORITE, Material.GRANITE);

    /** Радиус, в котором считаем сломанные игроком блоки для контекста. */
    private static final double CONTEXT_RADIUS = 12.0;

    private final VanillaCorePlugin plugin;

    /** Ключ «мир:x:y:z» → материал ловушки. */
    private final Map<String, Material> traps = new HashMap<>();
    /** Чанки, где ловушку уже пытались поставить: второй раз не пробуем. */
    private final Set<Long> visited = new HashSet<>();
    /** Сколько ловушек выкопал игрок за эту сессию. */
    private final Map<UUID, Integer> hits = new HashMap<>();
    /** Что игрок ломал недавно — нужно, чтобы отличить штрек от прямого хода. */
    private final Map<UUID, List<long[]>> recentBreaks = new HashMap<>();

    private boolean dirty;

    public XrayTraps(VanillaCorePlugin plugin) {
        this.plugin = plugin;
    }

    private File file() {
        return new File(plugin.getDataFolder(), "xray-traps.yml");
    }

    public void load() {
        File file = file();
        if (!file.exists()) return;
        YamlConfiguration data = YamlConfiguration.loadConfiguration(file);
        for (String key : data.getKeys(false)) {
            Material ore = Material.matchMaterial(data.getString(key, ""));
            if (ore != null) traps.put(key.replace('_', ':'), ore);
        }
        plugin.getLogger().info("Ловушек X-Ray загружено: " + traps.size());
    }

    public void save() {
        if (!dirty) return;
        YamlConfiguration data = new YamlConfiguration();
        traps.forEach((key, ore) -> data.set(key.replace(':', '_'), ore.name()));
        try {
            plugin.getDataFolder().mkdirs();
            data.save(file());
            dirty = false;
        } catch (IOException e) {
            plugin.getLogger().log(Level.WARNING, "Не удалось сохранить ловушки X-Ray", e);
        }
    }

    private static String key(World world, int x, int y, int z) {
        return world.getName() + ":" + x + ":" + y + ":" + z;
    }

    /**
     * Новый прогруженный кусок мира — с некоторой вероятностью прячем в нём
     * ловушку. Ставим при загрузке, а не при генерации: так ловушки появляются
     * и в давно исследованных местах, куда X-Ray как раз и ходит.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onChunkLoad(ChunkLoadEvent event) {
        if (!plugin.config().xrayEnabled) return;

        Chunk chunk = event.getChunk();
        if (!chunk.getWorld().getName().equals(plugin.config().xrayWorld)) return;

        long id = ((long) chunk.getX() << 32) ^ (chunk.getZ() & 0xffffffffL);
        if (!visited.add(id)) return;

        var random = ThreadLocalRandom.current();
        if (random.nextInt(100) >= plugin.config().xrayChunkPercent) return;

        // Ищем закрытое со всех сторон место. Несколько попыток: в пещеристом
        // куске мира подходящей точки может и не найтись, и это нормально.
        for (int attempt = 0; attempt < 12; attempt++) {
            int x = (chunk.getX() << 4) + random.nextInt(16);
            int z = (chunk.getZ() << 4) + random.nextInt(16);
            int y = random.nextInt(plugin.config().xrayMinY, plugin.config().xrayMaxY + 1);

            Block block = chunk.getWorld().getBlockAt(x, y, z);
            if (!buried(block)) continue;

            Material ore = ORES.get(random.nextInt(ORES.size()));
            // Глубинную породу подменяем её же вариантом руды, иначе ловушка
            // выделяется даже без X-Ray.
            if (block.getType() == Material.DEEPSLATE && ore == Material.DIAMOND_ORE) {
                ore = Material.DEEPSLATE_DIAMOND_ORE;
            }
            block.setType(ore, false);
            traps.put(key(chunk.getWorld(), x, y, z), ore);
            dirty = true;
            return;
        }
    }

    /** Со всех шести сторон — сплошная порода, и сам блок тоже. */
    private boolean buried(Block block) {
        if (!HOST.contains(block.getType())) return false;
        int[][] sides = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
        for (int[] side : sides) {
            Block neighbour = block.getRelative(side[0], side[1], side[2]);
            if (!HOST.contains(neighbour.getType())) return false;
        }
        return true;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent event) {
        if (!plugin.config().xrayEnabled) return;

        Player player = event.getPlayer();
        Block block = event.getBlock();
        remember(player, block);

        String key = key(block.getWorld(), block.getX(), block.getY(), block.getZ());
        Material ore = traps.remove(key);
        if (ore == null) return;
        dirty = true;

        // Администрацию не ловим: она ходит в наблюдателе и по служебным делам.
        if (plugin.auth().adminLevel(player) >= 2) return;

        int count = hits.merge(player.getUniqueId(), 1, Integer::sum);
        plugin.getLogger().warning("Ловушка X-Ray: " + Accounts.name(player) + " выкопал " + ore
                + " на " + block.getX() + ", " + block.getY() + ", " + block.getZ());

        plugin.api().post("/api/mc/xray", Map.of(
                "login", Accounts.name(player),
                "ore", ore.name(),
                "world", block.getWorld().getName(),
                "x", block.getX(),
                "y", block.getY(),
                "z", block.getZ(),
                "hits", count,
                "brokenNearby", brokenNearby(player, block)));
    }

    /** Последние сломанные блоки: по ним видно, копал он вокруг или шёл в точку. */
    private void remember(Player player, Block block) {
        List<long[]> list = recentBreaks.computeIfAbsent(player.getUniqueId(), id -> new ArrayList<>());
        list.add(new long[]{block.getX(), block.getY(), block.getZ(), System.currentTimeMillis()});
        // Держим только свежее и немного: это подсказка администрации, а не журнал.
        long cutoff = System.currentTimeMillis() - 300_000L;
        list.removeIf(entry -> entry[3] < cutoff);
        while (list.size() > 400) list.remove(0);
    }

    private int brokenNearby(Player player, Block block) {
        List<long[]> list = recentBreaks.get(player.getUniqueId());
        if (list == null) return 0;
        int count = 0;
        for (long[] entry : list) {
            double dx = entry[0] - block.getX();
            double dy = entry[1] - block.getY();
            double dz = entry[2] - block.getZ();
            if (dx * dx + dy * dy + dz * dz <= CONTEXT_RADIUS * CONTEXT_RADIUS) count++;
        }
        return count;
    }

    public void forget(Player player) {
        hits.remove(player.getUniqueId());
        recentBreaks.remove(player.getUniqueId());
    }
}
