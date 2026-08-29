package host.vanilla.core.season;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.Messages;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Искры сезона: в случайных местах рядом с игроками вспыхивает сгусток частиц.
 * Кто дошёл первым — забирает награду: осколки или VC. Сколько именно, решает
 * сервер в момент появления, а начисляет сайт — плагин деньги не печатает.
 */
public final class SparkManager {

    /** Одна искра: где висит, до какого времени и что в ней лежит. */
    private static final class Spark {
        final UUID id = UUID.randomUUID();
        final Location location;
        final long expiresAt;
        final boolean vc;
        final int amount;
        boolean claimed;

        Spark(Location location, long expiresAt, boolean vc, int amount) {
            this.location = location;
            this.expiresAt = expiresAt;
            this.vc = vc;
            this.amount = amount;
        }
    }

    private final VanillaCorePlugin plugin;
    private final Messages messages;
    private final List<Spark> active = new ArrayList<>();

    public SparkManager(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    public int activeCount() {
        return active.size();
    }

    /** Пытается зажечь новую искру рядом со случайным игроком. */
    public void spawn() {
        if (!plugin.config().sparkEnabled) return;
        if (active.size() >= plugin.config().sparkMaxActive) return;

        List<Player> candidates = new ArrayList<>();
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            if (!plugin.auth().authenticated(player)) continue;
            if (plugin.jail().isJailed(player)) continue;
            if (player.getWorld().getName().equals(plugin.config().jailWorld)) continue;
            candidates.add(player);
        }
        if (candidates.isEmpty()) return;

        Player anchor = candidates.get(ThreadLocalRandom.current().nextInt(candidates.size()));
        Location location = pickLocation(anchor);
        if (location == null) return;

        boolean vc = ThreadLocalRandom.current().nextDouble() < plugin.config().sparkVcChance;
        int amount = vc
                ? roll(plugin.config().sparkVcMin, plugin.config().sparkVcMax)
                : roll(plugin.config().sparkShardsMin, plugin.config().sparkShardsMax);

        Spark spark = new Spark(location, System.currentTimeMillis()
                + plugin.config().sparkLifetimeSeconds * 1000L, vc, amount);
        active.add(spark);
        announce(spark);
    }

    /** Принудительный запуск для проверки: искра появляется рядом с админом. */
    public boolean spawnNear(Player admin) {
        Location location = pickLocation(admin);
        if (location == null) return false;
        boolean vc = ThreadLocalRandom.current().nextBoolean();
        int amount = vc
                ? roll(plugin.config().sparkVcMin, plugin.config().sparkVcMax)
                : roll(plugin.config().sparkShardsMin, plugin.config().sparkShardsMax);
        Spark spark = new Spark(location, System.currentTimeMillis()
                + plugin.config().sparkLifetimeSeconds * 1000L, vc, amount);
        active.add(spark);
        announce(spark);
        return true;
    }

    /**
     * Награда смещена к маленьким значениям: иначе каждая вторая искра давала бы
     * потолок, и крупная находка перестала бы что-то значить.
     */
    private int roll(int min, int max) {
        double weighted = Math.pow(ThreadLocalRandom.current().nextDouble(), 2.4);
        return min + (int) Math.round(weighted * (max - min));
    }

    /** Ищет безопасное место в стороне от игрока: на поверхности и не в лаве. */
    private Location pickLocation(Player anchor) {
        World world = anchor.getWorld();
        var config = plugin.config();

        for (int attempt = 0; attempt < 12; attempt++) {
            double angle = ThreadLocalRandom.current().nextDouble() * Math.PI * 2;
            double distance = config.sparkMinDistance
                    + ThreadLocalRandom.current().nextDouble()
                            * (config.sparkMaxDistance - config.sparkMinDistance);
            int x = (int) Math.round(anchor.getLocation().getX() + Math.cos(angle) * distance);
            int z = (int) Math.round(anchor.getLocation().getZ() + Math.sin(angle) * distance);

            // Незагруженные чанки не трогаем: подгрузка ради искры — лишний лаг.
            if (!world.isChunkLoaded(x >> 4, z >> 4)) continue;

            var ground = world.getHighestBlockAt(x, z);
            Material type = ground.getType();
            if (type == Material.LAVA || type == Material.WATER || !type.isSolid()) continue;

            return ground.getLocation().add(0.5, 1.4, 0.5);
        }
        return null;
    }

    private void announce(Spark spark) {
        if (!plugin.config().sparkAnnounce) return;
        Location location = spark.location;
        int radius = plugin.config().sparkAnnounceRadius;

        for (Player player : plugin.getServer().getOnlinePlayers()) {
            if (!plugin.auth().authenticated(player)) continue;
            if (!player.getWorld().equals(location.getWorld())) continue;
            if (player.getLocation().distanceSquared(location) > (double) radius * radius) continue;

            player.sendMessage(messages.get("spark.spawned", Map.of(
                    "x", String.valueOf(location.getBlockX()),
                    "y", String.valueOf(location.getBlockY()),
                    "z", String.valueOf(location.getBlockZ()),
                    "distance", String.valueOf((int) player.getLocation().distance(location)))));
            player.playSound(player.getLocation(), Sound.BLOCK_BEACON_POWER_SELECT, 0.6f, 1.6f);
        }
    }

    /** Рисует искры и раздаёт их тем, кто подошёл. Зовётся несколько раз в секунду. */
    public void tick() {
        if (active.isEmpty()) return;
        long now = System.currentTimeMillis();

        for (Spark spark : new ArrayList<>(active)) {
            if (spark.claimed || spark.expiresAt < now) {
                active.remove(spark);
                continue;
            }
            draw(spark);

            for (Player player : spark.location.getWorld().getPlayers()) {
                if (!plugin.auth().authenticated(player)) continue;
                if (plugin.jail().isJailed(player)) continue;
                // Наблюдатель пролетает сквозь стены: забирать искру ему нечестно.
                if (player.getGameMode() == org.bukkit.GameMode.SPECTATOR) continue;
                double radius = plugin.config().sparkClaimRadius;
                if (player.getLocation().distanceSquared(spark.location) > radius * radius) continue;

                claim(spark, player);
                break;
            }
        }
    }

    private void draw(Spark spark) {
        World world = spark.location.getWorld();
        if (world == null) return;

        Particle.DustOptions dust = new Particle.DustOptions(
                spark.vc ? org.bukkit.Color.fromRGB(245, 196, 81)
                        : org.bukkit.Color.fromRGB(126, 214, 255),
                1.4f);

        double phase = (System.currentTimeMillis() % 2000) / 2000.0 * Math.PI * 2;
        for (int i = 0; i < 6; i++) {
            double angle = phase + i * Math.PI / 3;
            double radius = 0.45;
            world.spawnParticle(Particle.DUST,
                    spark.location.clone().add(Math.cos(angle) * radius,
                            Math.sin(phase * 2 + i) * 0.25, Math.sin(angle) * radius),
                    1, 0, 0, 0, 0, dust);
        }
        world.spawnParticle(Particle.END_ROD, spark.location, 1, 0.05, 0.15, 0.05, 0.001);
    }

    /** Награду начисляет сайт: он же следит, чтобы одна искра не ушла дважды. */
    private void claim(Spark spark, Player player) {
        spark.claimed = true;
        active.remove(spark);

        plugin.api().onMain(
                plugin.api().post("/api/mc/event/claim", Map.of(
                        "login", Accounts.name(player),
                        "sparkId", spark.id.toString(),
                        "kind", spark.vc ? "VC" : "SHARDS",
                        "amount", spark.amount)),
                response -> {
                    String status = response.has("status") ? response.get("status").getAsString() : "error";
                    if (!"ok".equals(status)) {
                        player.sendMessage(messages.get("spark.failed"));
                        return;
                    }

                    if (spark.vc) {
                        plugin.auth().profile(player).setBalanceVc(response.get("balance").getAsInt());
                        player.sendMessage(messages.get("spark.claimed-vc", Map.of(
                                "amount", String.valueOf(spark.amount),
                                "balance", response.get("balance").getAsString())));
                    } else {
                        player.sendMessage(messages.get("spark.claimed-shards", Map.of(
                                "amount", String.valueOf(spark.amount),
                                "total", response.get("shards").getAsString())));
                    }

                    World world = spark.location.getWorld();
                    if (world != null) {
                        world.spawnParticle(Particle.TOTEM_OF_UNDYING, spark.location, 40, 0.4, 0.6, 0.4, 0.25);
                    }
                    player.playSound(player.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 0.7f, 1.5f);
                });
    }
}
