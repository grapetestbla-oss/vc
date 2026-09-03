package host.vanilla.core.shop;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Accounts;
import host.vanilla.core.util.LocationCodec;
import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Точки дома. Хранит их сайт: там они переживают и перезапуск сервера, и
 * переустановку плагина, а сколько точек игроку положено, решает уровень —
 * плагину эту арифметику знать незачем.
 */
public final class HomesManager {

    public record Home(String name, Location location) {}

    /** Сколько точек занято и сколько доступно — для /homes и подсказок. */
    public record Capacity(int used, int total, Integer nextPrice, Integer nextLevel) {}

    private final VanillaCorePlugin plugin;

    private final Map<UUID, List<Home>> homes = new HashMap<>();
    private final Map<UUID, Capacity> capacity = new HashMap<>();

    public HomesManager(VanillaCorePlugin plugin) {
        this.plugin = plugin;
    }

    /** Перечитывает дома игрока. Вызывается при входе и перед каждой командой. */
    public void refresh(Player player, Runnable after) {
        plugin.api().onMain(
                plugin.api().get("/api/mc/homes?login=" + Accounts.name(player)),
                response -> {
                    if (player.isOnline() && response.get("_status").getAsInt() == 200) {
                        apply(player, response);
                    }
                    if (after != null) after.run();
                });
    }

    private void apply(Player player, JsonObject response) {
        List<Home> parsed = new ArrayList<>();
        if (response.has("homes") && response.get("homes").isJsonArray()) {
            for (JsonElement element : response.getAsJsonArray("homes")) {
                JsonObject home = element.getAsJsonObject();
                Location location = LocationCodec.decode(home.get("location").getAsString());
                // Мир мог быть удалён после вайпа: такую точку просто не показываем,
                // но с сайта не стираем — вдруг мир вернут из бэкапа.
                if (location == null) continue;
                parsed.add(new Home(home.get("name").getAsString(), location));
            }
        }
        homes.put(player.getUniqueId(), parsed);

        if (response.has("capacity") && response.get("capacity").isJsonObject()) {
            JsonObject cap = response.getAsJsonObject("capacity");
            capacity.put(player.getUniqueId(), new Capacity(
                    cap.get("used").getAsInt(),
                    cap.get("total").getAsInt(),
                    optionalInt(cap, "nextPrice"),
                    optionalInt(cap, "nextLevel")));
        }
    }

    private Integer optionalInt(JsonObject object, String key) {
        return object.has(key) && !object.get(key).isJsonNull() ? object.get(key).getAsInt() : null;
    }

    public List<Home> list(Player player) {
        return homes.getOrDefault(player.getUniqueId(), List.of());
    }

    public Capacity capacity(Player player) {
        return capacity.get(player.getUniqueId());
    }

    /** Точка по имени. Без имени — единственная, если она одна. */
    public Home find(Player player, String name) {
        List<Home> owned = list(player);
        if (name == null || name.isBlank()) {
            return owned.size() == 1 ? owned.get(0) : byName(owned, ShopCommands.DEFAULT_HOME);
        }
        return byName(owned, name.toLowerCase(Locale.ROOT));
    }

    private Home byName(List<Home> owned, String name) {
        for (Home home : owned) {
            if (home.name().equals(name)) return home;
        }
        return null;
    }

    /**
     * Сохраняет точку. Отказ приходит с сайта готовым текстом: причина («все
     * точки заняты», «имя не подходит») зависит от уровня и покупок, а их
     * считает сайт.
     */
    public void save(Player player, String name, Location location, Consumer<String> onDone) {
        send(player, Map.of(
                "login", Accounts.name(player),
                "action", "set",
                "name", name == null ? "" : name,
                "location", LocationCodec.encode(location)), onDone);
    }

    public void delete(Player player, String name, Consumer<String> onDone) {
        send(player, Map.of(
                "login", Accounts.name(player),
                "action", "delete",
                "name", name), onDone);
    }

    private void send(Player player, Map<String, ?> body, Consumer<String> onDone) {
        plugin.api().onMain(plugin.api().post("/api/mc/homes", body), response -> {
            if (!player.isOnline()) return;
            String status = response.has("status") ? response.get("status").getAsString() : "error";
            if ("ok".equals(status)) {
                apply(player, response);
                onDone.accept(null);
                return;
            }
            onDone.accept(response.has("error") ? response.get("error").getAsString() : "Не получилось");
        });
    }

    public void forget(Player player) {
        homes.remove(player.getUniqueId());
        capacity.remove(player.getUniqueId());
    }
}
