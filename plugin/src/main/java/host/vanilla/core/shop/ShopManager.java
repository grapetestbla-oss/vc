package host.vanilla.core.shop;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.LocationCodec;
import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Купленное в магазине сайта. Кэш нужен только чтобы не ходить в сеть на каждое
 * нажатие: сколько осталось использований, решает всегда сайт — иначе перезаход
 * на сервер обнулял бы траты.
 */
public final class ShopManager {

    /** Одна покупка игрока в том виде, в каком её отдаёт сайт. */
    public record Entry(String key, String feature, String title, boolean permanent, int chargesLeft,
                        String data, int cooldownSeconds) {
        public boolean usable() {
            return permanent || chargesLeft > 0;
        }
    }

    /** Возможности магазина в том порядке, в каком их показывает /shop. */
    public static final java.util.List<String> FEATURES =
            java.util.List.of("tp", "home", "back", "enderchest", "craft", "keepinv");

    private final VanillaCorePlugin plugin;

    /** feature → покупка, по игроку. */
    private final Map<UUID, Map<String, Entry>> owned = new HashMap<>();
    /** Последнее использование конкретной возможности — для кулдауна /home. */
    private final Map<UUID, Map<String, Long>> lastUse = new HashMap<>();
    /** Место последней смерти для /back. */
    private final Map<UUID, Location> deathPoints = new HashMap<>();

    public ShopManager(VanillaCorePlugin plugin) {
        this.plugin = plugin;
    }

    /** Перечитывает покупки игрока с сайта. Вызывается при входе и после /shop. */
    public void refresh(Player player) {
        refresh(player, null);
    }

    public void refresh(Player player, Runnable after) {
        plugin.api().onMain(
                plugin.api().get("/api/mc/shop?login=" + Accounts.name(player)),
                response -> {
                    if (!player.isOnline()) return;
                    if (response.get("_status").getAsInt() != 200) {
                        if (after != null) after.run();
                        return;
                    }

                    Map<String, Entry> entries = new HashMap<>();
                    for (JsonElement element : response.getAsJsonArray("items")) {
                        JsonObject item = element.getAsJsonObject();
                        JsonObject payload = item.has("payload") && item.get("payload").isJsonObject()
                                ? item.getAsJsonObject("payload")
                                : new JsonObject();
                        Entry entry = new Entry(
                                item.get("key").getAsString(),
                                item.get("feature").getAsString(),
                                item.get("title").getAsString(),
                                item.get("permanent").getAsBoolean(),
                                item.get("chargesLeft").getAsInt(),
                                stateString(item),
                                payload.has("cooldownSeconds") ? payload.get("cooldownSeconds").getAsInt() : 0);
                        entries.put(entry.feature(), entry);
                    }
                    owned.put(player.getUniqueId(), entries);
                    if (after != null) after.run();
                });
    }

    /** Состояние товара сайт хранит как JSON: у дома там строка с координатами. */
    private String stateString(JsonObject item) {
        if (!item.has("data") || item.get("data").isJsonNull()) return null;
        JsonElement data = item.get("data");
        if (data.isJsonPrimitive()) return data.getAsString();
        if (data.isJsonObject() && data.getAsJsonObject().has("location")) {
            return data.getAsJsonObject().get("location").getAsString();
        }
        return null;
    }

    public Entry entry(Player player, String feature) {
        return owned.getOrDefault(player.getUniqueId(), Map.of()).get(feature);
    }

    public boolean has(Player player, String feature) {
        Entry entry = entry(player, feature);
        return entry != null && entry.usable();
    }

    /**
     * Тратит одно использование. Действие выполняется только после ответа сайта:
     * если списать не удалось, игрок ничего не получает.
     */
    public void use(Player player, String feature, Consumer<Integer> onSuccess, Consumer<String> onFail) {
        use(player, feature, onSuccess, onFail, true);
    }

    private void use(Player player, String feature, Consumer<Integer> onSuccess,
                     Consumer<String> onFail, boolean retry) {
        Entry entry = entry(player, feature);
        if (entry == null || !entry.usable()) {
            // Могли купить минуту назад, а кэш ещё старый: перечитываем и пробуем
            // ещё раз, прежде чем говорить «не куплено».
            if (retry) {
                refresh(player, () -> {
                    if (player.isOnline()) use(player, feature, onSuccess, onFail, false);
                });
                return;
            }
            onFail.accept("not_owned");
            return;
        }

        plugin.api().onMain(
                plugin.api().post("/api/mc/shop/use",
                        Map.of("login", Accounts.name(player), "key", entry.key())),
                response -> {
                    if (!player.isOnline()) return;
                    String status = response.has("status") ? response.get("status").getAsString() : "error";
                    if (!"ok".equals(status)) {
                        onFail.accept(status);
                        refresh(player);
                        return;
                    }
                    int left = response.get("chargesLeft").getAsInt();
                    updateCharges(player, feature, left);
                    markUsed(player, feature);
                    onSuccess.accept(left);
                });
    }

    private void updateCharges(Player player, String feature, int left) {
        Map<String, Entry> entries = owned.get(player.getUniqueId());
        if (entries == null) return;
        Entry entry = entries.get(feature);
        if (entry == null) return;
        entries.put(feature, new Entry(entry.key(), entry.feature(), entry.title(), entry.permanent(),
                left < 0 ? entry.chargesLeft() : left, entry.data(), entry.cooldownSeconds()));
    }

    /** Локальное списание — для страховки инвентаря, где ждать сеть нельзя. */
    public void spendLocally(Player player, String feature) {
        Entry entry = entry(player, feature);
        if (entry == null) return;
        updateCharges(player, feature, Math.max(0, entry.chargesLeft() - 1));
    }

    public void markUsed(Player player, String feature) {
        lastUse.computeIfAbsent(player.getUniqueId(), id -> new HashMap<>())
                .put(feature, System.currentTimeMillis());
    }

    /** Сколько секунд осталось до следующего использования. 0 — можно сейчас. */
    public int cooldownLeft(Player player, String feature) {
        Entry entry = entry(player, feature);
        if (entry == null || entry.cooldownSeconds() <= 0) return 0;
        Long last = lastUse.getOrDefault(player.getUniqueId(), Map.of()).get(feature);
        if (last == null) return 0;
        long passed = (System.currentTimeMillis() - last) / 1000L;
        return (int) Math.max(0, entry.cooldownSeconds() - passed);
    }

    public Location home(Player player) {
        Entry entry = entry(player, "home");
        return entry == null ? null : LocationCodec.decode(entry.data());
    }

    /** Сохраняет точку дома на сайте — она переживает перезапуск сервера. */
    public void saveHome(Player player, Location location, Runnable after) {
        Entry entry = entry(player, "home");
        if (entry == null) return;
        String encoded = LocationCodec.encode(location);
        Map<String, Entry> entries = owned.get(player.getUniqueId());
        if (entries != null) {
            entries.put("home", new Entry(entry.key(), entry.feature(), entry.title(), entry.permanent(),
                    entry.chargesLeft(), encoded, entry.cooldownSeconds()));
        }
        plugin.api().onMain(
                plugin.api().post("/api/mc/shop/state", Map.of(
                        "login", Accounts.name(player),
                        "key", entry.key(),
                        "data", Map.of("location", encoded))),
                response -> after.run());
    }

    public void rememberDeath(Player player, Location location) {
        deathPoints.put(player.getUniqueId(), location);
    }

    public Location deathPoint(Player player) {
        return deathPoints.get(player.getUniqueId());
    }

    public void forget(Player player) {
        owned.remove(player.getUniqueId());
        lastUse.remove(player.getUniqueId());
        // Точку смерти держим: игрок мог выйти и зайти, чтобы вернуться за вещами.
    }
}
