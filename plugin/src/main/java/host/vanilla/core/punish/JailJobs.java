package host.vanilla.core.punish;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Entity;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Item;
import org.bukkit.entity.Player;
import org.bukkit.entity.Villager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Наряды в деморгане. Срок сам по себе идёт медленно, поэтому нормальный
 * способ выйти — работать: взять у прораба задание и выполнить его. Каждый
 * закрытый наряд списывает минуту срока, между нарядами — минута перерыва.
 *
 * Наград, кроме списания срока, нет: заключение не должно превращаться в
 * ферму ресурсов.
 */
public final class JailJobs implements Listener {

    /** Что именно требуется сделать. */
    private enum Kind { MINE, LITTER }

    /** Выданный наряд: сколько нужно и сколько уже сделано. */
    private static final class Job {
        final Kind kind;
        final String title;
        final int goal;
        int done;

        Job(Kind kind, String title, int goal) {
            this.kind = kind;
            this.title = title;
            this.goal = goal;
        }
    }

    private static final List<String> MINE_TITLES = List.of(
            "разобрать завал", "наколоть щебня", "расчистить штрек", "выбрать породу");
    private static final List<String> LITTER_TITLES = List.of(
            "убрать мусор во дворе", "подмести штрек", "собрать хлам после смены");

    private final VanillaCorePlugin plugin;
    private final Messages messages;

    private final Map<UUID, Job> jobs = new HashMap<>();
    /** Когда игроку можно взять следующий наряд. */
    private final Map<UUID, Long> cooldownUntil = new HashMap<>();
    private UUID foremanId;

    public JailJobs(VanillaCorePlugin plugin, Messages messages) {
        this.plugin = plugin;
        this.messages = messages;
    }

    /** Метка мусора: по ней отличаем выданный хлам от обычных предметов. */
    private org.bukkit.NamespacedKey litterKey() {
        return new org.bukkit.NamespacedKey(plugin, "jail_litter");
    }

    // ────────────────────────────── прораб ───────────────────────────────

    /** Создаёт прораба, если его нет: он мог исчезнуть после рестарта. */
    public void ensureForeman() {
        if (!plugin.config().jailJobsEnabled) return;

        var world = plugin.jail().zone().world();
        if (world == null) return;

        if (foremanId != null) {
            Entity existing = plugin.getServer().getEntity(foremanId);
            if (existing != null && existing.isValid()) return;
        }

        Location spot = plugin.jail().zone().spawn().clone().add(2.5, 0, 2.5);
        // Чужие деревенские рядом с зоной не должны считаться прорабом.
        for (Entity entity : world.getNearbyEntities(spot, 3, 3, 3)) {
            if (entity.getType() == EntityType.VILLAGER && entity.isCustomNameVisible()) entity.remove();
        }

        Villager foreman = (Villager) world.spawnEntity(spot, EntityType.VILLAGER);
        foreman.customName(Component.text(plugin.config().jailForemanName, NamedTextColor.GOLD));
        foreman.setCustomNameVisible(true);
        foreman.setProfession(Villager.Profession.MASON);
        foreman.setInvulnerable(true);
        foreman.setSilent(true);
        foreman.setAware(false);
        foreman.setCollidable(false);
        foreman.setRemoveWhenFarAway(false);
        foreman.setPersistent(true);
        foremanId = foreman.getUniqueId();
    }

    @EventHandler(ignoreCancelled = true)
    public void onInteract(PlayerInteractEntityEvent event) {
        if (foremanId == null || !event.getRightClicked().getUniqueId().equals(foremanId)) return;

        // Торговать с прорабом нельзя — он выдаёт наряды, а не изумруды.
        event.setCancelled(true);
        talk(event.getPlayer());
    }

    /** Разговор с прорабом: выдать наряд, показать прогресс или отказать. */
    private void talk(Player player) {
        if (!plugin.jail().isJailed(player)) {
            player.sendMessage(messages.get("jail.jobs.free"));
            return;
        }

        Job current = jobs.get(player.getUniqueId());
        if (current != null) {
            player.sendMessage(messages.get("jail.jobs.progress", Map.of(
                    "title", current.title,
                    "done", String.valueOf(current.done),
                    "goal", String.valueOf(current.goal))));
            return;
        }

        long until = cooldownUntil.getOrDefault(player.getUniqueId(), 0L);
        long left = (until - System.currentTimeMillis()) / 1000;
        if (left > 0) {
            player.sendMessage(messages.get("jail.jobs.cooldown", Map.of(
                    "seconds", String.valueOf(left))));
            return;
        }

        give(player);
    }

    private void give(Player player) {
        var random = ThreadLocalRandom.current();
        var config = plugin.config();
        Job job;

        if (random.nextBoolean()) {
            int goal = random.nextInt(config.jailJobBlocksMin, config.jailJobBlocksMax + 1);
            job = new Job(Kind.MINE, MINE_TITLES.get(random.nextInt(MINE_TITLES.size())), goal);
        } else {
            int goal = random.nextInt(config.jailJobLitterMin, config.jailJobLitterMax + 1);
            job = new Job(Kind.LITTER, LITTER_TITLES.get(random.nextInt(LITTER_TITLES.size())), goal);
            scatterLitter(player, goal);
        }

        jobs.put(player.getUniqueId(), job);
        player.sendMessage(messages.get("jail.jobs.taken", Map.of(
                "title", job.title,
                "goal", String.valueOf(job.goal),
                "what", job.kind == Kind.MINE ? "блоков" : "мешков мусора")));
        player.playSound(player.getLocation(), Sound.ENTITY_VILLAGER_YES, 0.8f, 1.1f);
    }

    /** Раскидывает по зоне помеченный хлам, который нужно собрать. */
    private void scatterLitter(Player player, int count) {
        var world = plugin.jail().zone().world();
        if (world == null) return;

        Location center = plugin.jail().zone().spawn();
        var random = ThreadLocalRandom.current();
        int half = Math.max(3, plugin.config().jailSize / 2 - 2);

        for (int i = 0; i < count; i++) {
            Location spot = center.clone().add(
                    random.nextInt(-half, half + 1) + 0.5,
                    0.4,
                    random.nextInt(-half, half + 1) + 0.5);

            ItemStack trash = new ItemStack(Material.PAPER);
            ItemMeta meta = trash.getItemMeta();
            meta.displayName(Component.text("Мусор", NamedTextColor.GRAY));
            meta.getPersistentDataContainer().set(litterKey(), PersistentDataType.STRING,
                    player.getUniqueId().toString());
            trash.setItemMeta(meta);

            Item dropped = world.dropItem(spot, trash);
            dropped.setCanMobPickup(false);
            dropped.setUnlimitedLifetime(false);
            dropped.setPersistent(false);
        }
    }

    // ───────────────────────────── прогресс ──────────────────────────────

    /** Сломан блок в шахте — засчитываем в наряд, если он про добычу. */
    public void onBlockMined(Player player) {
        Job job = jobs.get(player.getUniqueId());
        if (job == null || job.kind != Kind.MINE) return;
        advance(player, job);
    }

    /**
     * Мусор подбирают не в инвентарь: он не должен занимать слоты и уж тем
     * более выноситься из деморгана.
     */
    @EventHandler(ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (!(event.getEntity() instanceof Player player)) return;

        ItemStack stack = event.getItem().getItemStack();
        if (!stack.hasItemMeta()) return;
        String owner = stack.getItemMeta().getPersistentDataContainer()
                .get(litterKey(), PersistentDataType.STRING);
        if (owner == null) return;

        event.setCancelled(true);
        // Чужой мусор просто исчезает: помогать друг другу нарядами нельзя.
        event.getItem().remove();
        if (!owner.equals(player.getUniqueId().toString())) return;

        Job job = jobs.get(player.getUniqueId());
        if (job == null || job.kind != Kind.LITTER) return;
        advance(player, job);
    }

    private void advance(Player player, Job job) {
        job.done++;
        if (job.done < job.goal) {
            player.sendActionBar(messages.plain("jail.jobs.actionbar", Map.of(
                    "title", job.title,
                    "done", String.valueOf(job.done),
                    "goal", String.valueOf(job.goal))));
            return;
        }

        finish(player, job);
    }

    private void finish(Player player, Job job) {
        jobs.remove(player.getUniqueId());
        cooldownUntil.put(player.getUniqueId(),
                System.currentTimeMillis() + plugin.config().jailJobCooldownSeconds * 1000L);

        int reward = plugin.config().jailJobRewardSeconds;
        player.playSound(player.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 0.7f, 1.3f);
        player.getWorld().spawnParticle(Particle.HAPPY_VILLAGER, player.getLocation().add(0, 1, 0),
                20, 0.4, 0.6, 0.4, 0.02);

        boolean released = plugin.jail().reduceSentence(player, reward);
        if (released) return;

        player.sendMessage(messages.get("jail.jobs.done", Map.of(
                "title", job.title,
                "minutes", String.valueOf(Math.max(1, reward / 60)),
                "left", Messages.formatTime(
                        plugin.jail().jailOf(player) == null
                                ? 0
                                : plugin.jail().jailOf(player).remainingSeconds()))));
    }

    /** Освобождение и выход: наряд не должен пережить отсидку. */
    public void forget(Player player) {
        jobs.remove(player.getUniqueId());
        cooldownUntil.remove(player.getUniqueId());
    }

    /** Мусор, который никто не собрал, убираем вместе с нарядом. */
    public void cleanupLitter() {
        var world = plugin.jail().zone().world();
        if (world == null) return;

        List<Item> stale = new ArrayList<>();
        for (Entity entity : world.getEntities()) {
            if (!(entity instanceof Item item)) continue;
            ItemStack stack = item.getItemStack();
            if (!stack.hasItemMeta()) continue;
            String owner = stack.getItemMeta().getPersistentDataContainer()
                    .get(litterKey(), PersistentDataType.STRING);
            if (owner == null) continue;
            // Хлам живёт, только пока у хозяина есть наряд на уборку.
            if (jobs.containsKey(UUID.fromString(owner))) continue;
            stale.add(item);
        }
        stale.forEach(Item::remove);
    }
}
