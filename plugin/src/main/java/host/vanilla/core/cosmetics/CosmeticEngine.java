package host.vanilla.core.cosmetics;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Entity;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Mob;
import org.bukkit.entity.Player;
import org.bukkit.entity.TextDisplay;
import org.bukkit.inventory.ItemStack;
import org.bukkit.util.Transformation;
import org.joml.Vector3f;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Level;

/**
 * Косметика в игре: шлейфы, ауры, питомцы, шляпы, эффекты входа, цвета ников
 * и титулы над головой.
 *
 * Ни один предмет не даёт преимущества: питомцы неуязвимы, без ИИ и ничего не
 * подбирают, шляпа надевается только в пустой слот шлема и брони не даёт,
 * частицы — чистая графика.
 */
public final class CosmeticEngine {

    private final VanillaCorePlugin plugin;
    private final Map<UUID, CosmeticSet> sets = new HashMap<>();
    private final Map<UUID, UUID> pets = new HashMap<>();
    /** Команда табло, в которой у спутников выключены столкновения. */
    private static final String PET_TEAM = "vc_pets";
    private final Map<UUID, UUID> titles = new HashMap<>();
    /** Что было надето в прошлый раз: по нему видно, менялось ли что-то. */
    private final Map<UUID, String> signatures = new HashMap<>();
    /** Кому уже сказали, что слот шлема занят: не повторяем на каждой проверке. */
    private final Set<UUID> hatWarned = new HashSet<>();
    private double phase;

    public CosmeticEngine(VanillaCorePlugin plugin) {
        this.plugin = plugin;
    }

    public CosmeticSet setOf(Player player) {
        return sets.computeIfAbsent(player.getUniqueId(), id -> new CosmeticSet());
    }

    /**
     * Применяет косметику из профиля, который вернул сайт. Возвращает false,
     * если набор не изменился: перевыдавать питомца и титул на каждой проверке
     * нельзя — они бы моргали и телепортировались.
     */
    public boolean apply(Player player, JsonArray cosmetics) {
        String signature = signature(cosmetics);
        if (signature.equals(signatures.get(player.getUniqueId()))
                && setOf(player).has(CosmeticSet.Kind.HAT) == hasHat(player)) {
            return false;
        }
        signatures.put(player.getUniqueId(), signature);

        CosmeticSet set = setOf(player);
        set.clear();

        for (int i = 0; i < cosmetics.size(); i++) {
            JsonObject entry = cosmetics.get(i).getAsJsonObject();
            CosmeticSet.Kind kind = CosmeticSet.parseKind(entry.get("kind").getAsString());
            if (kind == null) continue;

            Integer serial = entry.has("serial") && !entry.get("serial").isJsonNull()
                    ? entry.get("serial").getAsInt()
                    : null;
            set.put(new CosmeticSet.Item(
                    entry.get("key").getAsString(),
                    kind,
                    entry.getAsJsonObject("payload"),
                    serial));
        }

        applyHat(player, set);
        applyPet(player, set);
        applyTitle(player, set);
        plugin.refreshDisplayName(player);
        return true;
    }

    /** Подпись набора: ключи всех надетых предметов по порядку. */
    private static String signature(JsonArray cosmetics) {
        List<String> keys = new ArrayList<>();
        for (int i = 0; i < cosmetics.size(); i++) {
            JsonObject entry = cosmetics.get(i).getAsJsonObject();
            keys.add(entry.get("kind").getAsString() + ":" + entry.get("key").getAsString());
        }
        Collections.sort(keys);
        return String.join(",", keys);
    }

    private boolean hasHat(Player player) {
        return isHat(player.getInventory().getHelmet());
    }

    /**
     * Наблюдателя не видно другим игрокам, а пассажира ему не посадить —
     * шляпа, питомец и титул в этом режиме просто не появятся. Молча это
     * оставлять нельзя: со стороны выглядит как сломанная косметика.
     */
    public boolean hiddenByGameMode(Player player) {
        return player.getGameMode() == org.bukkit.GameMode.SPECTATOR && !setOf(player).isEmpty();
    }

    public TextColor nameColor(Player player) {
        CosmeticSet.Item item = setOf(player).get(CosmeticSet.Kind.NAME_COLOR);
        if (item == null || !item.payload().has("color")) return null;
        return TextColor.fromHexString(item.payload().get("color").getAsString());
    }

    // ─────────────────────────────── шляпа ───────────────────────────────

    private void applyHat(Player player, CosmeticSet set) {
        CosmeticSet.Item hat = set.get(CosmeticSet.Kind.HAT);
        ItemStack helmet = player.getInventory().getHelmet();

        if (hat == null) {
            if (isHat(helmet)) player.getInventory().setHelmet(null);
            hatWarned.remove(player.getUniqueId());
            return;
        }
        // Настоящий шлем важнее шляпы: снимать броню без спроса нельзя. Пустой
        // слот приходит и как null, и как «воздух» — второе раньше принимали за
        // броню, и шляпа не надевалась на голую голову.
        if (!empty(helmet) && !isHat(helmet)) {
            // Косметику перечитываем каждые 45 секунд, поэтому предупреждаем
            // один раз — до тех пор, пока слот не освободится.
            if (hatWarned.add(player.getUniqueId())) {
                player.sendMessage(plugin.messages().get("cosmetics.hat-blocked"));
            }
            return;
        }
        hatWarned.remove(player.getUniqueId());

        Material material = Material.matchMaterial(hat.payload().get("material").getAsString());
        if (material == null) return;

        ItemStack item = new ItemStack(material);
        item.editMeta(meta -> {
            meta.displayName(Component.text("Косметическая шляпа"));
            meta.setUnbreakable(true);
            meta.getPersistentDataContainer().set(plugin.hatKey(),
                    org.bukkit.persistence.PersistentDataType.BYTE, (byte) 1);
        });
        player.getInventory().setHelmet(item);
    }

    /** Пустой слот брони: и null, и «воздух», и стопка нулевого размера. */
    private static boolean empty(ItemStack item) {
        return item == null || item.getType().isAir() || item.getAmount() <= 0;
    }

    public boolean isHat(ItemStack item) {
        if (empty(item) || !item.hasItemMeta()) return false;
        return item.getItemMeta().getPersistentDataContainer()
                .has(plugin.hatKey(), org.bukkit.persistence.PersistentDataType.BYTE);
    }

    // ────────────────────────────── питомец ──────────────────────────────

    private void applyPet(Player player, CosmeticSet set) {
        removePet(player);
        CosmeticSet.Item pet = set.get(CosmeticSet.Kind.PET);
        if (pet == null) return;

        EntityType type;
        try {
            type = EntityType.valueOf(pet.payload().get("entity").getAsString());
        } catch (IllegalArgumentException e) {
            plugin.getLogger().warning("Неизвестный питомец: " + pet.key());
            return;
        }

        try {
            Entity entity = player.getWorld().spawnEntity(player.getLocation(), type);
            if (entity instanceof LivingEntity living) {
                living.setInvulnerable(true);
                living.setSilent(true);
                living.setRemoveWhenFarAway(false);
                living.setCollidable(false);
                living.setPersistent(false);
                // setCollidable снимает только толкание между сущностями, а
                // спутник ещё и упирался в игрока. Команда с правилом «никогда»
                // отключает столкновения по-настоящему.
                noCollision(living);
                living.customName(Component.text(pet.payload().has("name")
                        ? pet.payload().get("name").getAsString()
                        : "Питомец"));
                living.setCustomNameVisible(true);
                if (living instanceof Mob mob) {
                    mob.setAware(false); // без ИИ: не дерётся, не подбирает, не мешает
                }
                if (pet.payload().has("glowing") && pet.payload().get("glowing").getAsBoolean()) {
                    living.setGlowing(true);
                }
                pets.put(player.getUniqueId(), living.getUniqueId());
            } else {
                entity.remove();
            }
        } catch (IllegalArgumentException e) {
            plugin.getLogger().log(Level.WARNING, "Не удалось создать питомца " + pet.key(), e);
        }
    }

    /** Общая команда для спутников: столкновения в ней выключены полностью. */
    private void noCollision(LivingEntity pet) {
        var board = plugin.getServer().getScoreboardManager().getMainScoreboard();
        var team = board.getTeam(PET_TEAM);
        if (team == null) {
            team = board.registerNewTeam(PET_TEAM);
            team.setOption(org.bukkit.scoreboard.Team.Option.COLLISION_RULE,
                    org.bukkit.scoreboard.Team.OptionStatus.NEVER);
            // Имя спутника рисуем сами, командное оформление тут лишнее.
            team.setOption(org.bukkit.scoreboard.Team.Option.NAME_TAG_VISIBILITY,
                    org.bukkit.scoreboard.Team.OptionStatus.ALWAYS);
        }
        team.addEntry(pet.getUniqueId().toString());
    }

    private void removePet(Player player) {
        UUID petId = pets.remove(player.getUniqueId());
        if (petId == null) return;
        Entity entity = plugin.getServer().getEntity(petId);
        var team = plugin.getServer().getScoreboardManager().getMainScoreboard().getTeam(PET_TEAM);
        if (team != null) team.removeEntry(petId.toString());
        if (entity != null) entity.remove();
    }

    // ─────────────────────────────── титул ───────────────────────────────

    private void applyTitle(Player player, CosmeticSet set) {
        removeTitle(player);
        CosmeticSet.Item title = set.get(CosmeticSet.Kind.TITLE);
        if (title == null) return;

        TextColor color = title.payload().has("color")
                ? TextColor.fromHexString(title.payload().get("color").getAsString())
                : null;
        Component base = Component.text(title.payload().get("text").getAsString());
        final Component text = color != null ? base.color(color) : base;

        TextDisplay display = player.getWorld().spawn(player.getLocation(), TextDisplay.class, entity -> {
            entity.text(text);
            entity.setBillboard(org.bukkit.entity.Display.Billboard.CENTER);
            entity.setPersistent(false);
            entity.setTransformation(new Transformation(
                    new Vector3f(0f, 0.6f, 0f),
                    new org.joml.AxisAngle4f(),
                    new Vector3f(0.9f, 0.9f, 0.9f),
                    new org.joml.AxisAngle4f()));
        });
        player.addPassenger(display); // едет над головой и виден всем вокруг
        titles.put(player.getUniqueId(), display.getUniqueId());
    }

    private void removeTitle(Player player) {
        UUID titleId = titles.remove(player.getUniqueId());
        if (titleId == null) return;
        Entity entity = plugin.getServer().getEntity(titleId);
        if (entity != null) entity.remove();
    }

    // ───────────────────────── эффект появления ──────────────────────────

    public void playJoinEffect(Player player) {
        CosmeticSet.Item effect = setOf(player).get(CosmeticSet.Kind.JOIN_EFFECT);
        if (effect == null) return;
        JsonObject payload = effect.payload();

        if (payload.has("sound")) {
            try {
                Sound sound = org.bukkit.Registry.SOUNDS.get(org.bukkit.NamespacedKey.minecraft(
                        payload.get("sound").getAsString().toLowerCase(java.util.Locale.ROOT)));
                if (sound != null) {
                    boolean global = payload.has("global") && payload.get("global").getAsBoolean();
                    if (global) {
                        for (Player listener : plugin.getServer().getOnlinePlayers()) {
                            listener.playSound(listener.getLocation(), sound, 0.7f, 1f);
                        }
                    } else {
                        player.getWorld().playSound(player.getLocation(), sound, 1f, 1f);
                    }
                }
            } catch (IllegalArgumentException ignored) {
                // звук из другой версии — молча пропускаем
            }
        }

        if (payload.has("particle")) {
            Particle particle = particle(payload.get("particle").getAsString());
            if (particle != null) {
                player.getWorld().spawnParticle(particle, player.getLocation().add(0, 1, 0), 40, 0.4, 0.8, 0.4, 0.05);
            }
        }

        if (payload.has("lightning") && payload.get("lightning").getAsBoolean()) {
            player.getWorld().strikeLightningEffect(player.getLocation()); // только вспышка, без урона
        }
    }

    // ──────────────────────── шлейфы и ауры (тик) ────────────────────────

    /** Вызывается несколько раз в секунду. Рисует частицы вокруг игроков. */
    public void tick() {
        phase += 0.35;

        for (Player player : plugin.getServer().getOnlinePlayers()) {
            CosmeticSet set = sets.get(player.getUniqueId());
            if (set == null) continue;
            if (!plugin.auth().authenticated(player)) continue;
            if (plugin.jail().isJailed(player)) continue; // в деморгане не до красоты

            drawTrail(player, set.get(CosmeticSet.Kind.TRAIL));
            drawAura(player, set.get(CosmeticSet.Kind.AURA));
            followPet(player);
        }
    }

    private void drawTrail(Player player, CosmeticSet.Item item) {
        if (item == null) return;
        Particle particle = particle(item.payload().get("particle").getAsString());
        if (particle == null) return;

        int count = item.payload().has("count") ? item.payload().get("count").getAsInt() : 3;
        double speed = item.payload().has("speed") ? item.payload().get("speed").getAsDouble() : 0.01;
        Location behind = player.getLocation().add(0, 0.15, 0);
        player.getWorld().spawnParticle(particle, behind, count, 0.15, 0.05, 0.15, speed);
    }

    private void drawAura(Player player, CosmeticSet.Item item) {
        if (item == null) return;
        Particle particle = particle(item.payload().get("particle").getAsString());
        if (particle == null) return;

        double radius = item.payload().has("radius") ? item.payload().get("radius").getAsDouble() : 1.0;
        int count = item.payload().has("count") ? item.payload().get("count").getAsInt() : 4;
        Location center = player.getLocation().add(0, 1.0, 0);

        for (int i = 0; i < count; i++) {
            double angle = phase + (Math.PI * 2 * i / count);
            Location point = center.clone().add(Math.cos(angle) * radius, Math.sin(phase) * 0.25, Math.sin(angle) * radius);
            player.getWorld().spawnParticle(particle, point, 1, 0, 0, 0, 0);
        }
    }

    private void followPet(Player player) {
        UUID petId = pets.get(player.getUniqueId());
        if (petId == null) return;
        Entity pet = plugin.getServer().getEntity(petId);
        if (pet == null) {
            pets.remove(player.getUniqueId());
            return;
        }

        // Держим спутника сзади-сбоку, а не строго за спиной: при ходьбе назад
        // игрок наезжал на него, и спутник оказывался перед глазами.
        Location eye = player.getLocation();
        var back = eye.getDirection().setY(0).normalize().multiply(-1.1);
        var side = eye.getDirection().setY(0).normalize().crossProduct(new org.bukkit.util.Vector(0, 1, 0)).multiply(0.9);
        Location target = eye.clone().add(back).add(side).add(0, 0.4, 0);
        if (pet.getWorld() != player.getWorld() || pet.getLocation().distanceSquared(target) > 2.0) {
            pet.teleport(target);
        }
    }

    private Particle particle(String name) {
        try {
            return Particle.valueOf(name);
        } catch (IllegalArgumentException e) {
            plugin.getLogger().warning("Неизвестная частица: " + name);
            return null;
        }
    }

    /** Спутник ли это — по нему решаем, мешает ли он спать. */
    public boolean isPet(Entity entity) {
        return pets.containsValue(entity.getUniqueId());
    }

    public void forget(Player player) {
        removePet(player);
        removeTitle(player);
        sets.remove(player.getUniqueId());
        signatures.remove(player.getUniqueId());
        hatWarned.remove(player.getUniqueId());
    }

    public void shutdown() {
        for (UUID petId : Map.copyOf(pets).values()) {
            Entity entity = plugin.getServer().getEntity(petId);
            if (entity != null) entity.remove();
        }
        for (UUID titleId : Map.copyOf(titles).values()) {
            Entity entity = plugin.getServer().getEntity(titleId);
            if (entity != null) entity.remove();
        }
        pets.clear();
        titles.clear();
        sets.clear();
    }
}
