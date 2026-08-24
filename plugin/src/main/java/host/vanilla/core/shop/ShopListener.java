package host.vanilla.core.shop;

import host.vanilla.core.VanillaCorePlugin;
import host.vanilla.core.util.Messages;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;

/** Страховка инвентаря и запоминание места смерти для /back. */
public final class ShopListener implements Listener {

    private final VanillaCorePlugin plugin;
    private final ShopCommands commands;
    private final Messages messages;

    public ShopListener(VanillaCorePlugin plugin, ShopCommands commands, Messages messages) {
        this.plugin = plugin;
        this.commands = commands;
        this.messages = messages;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onDeath(PlayerDeathEvent event) {
        Player player = event.getEntity();
        plugin.shop().rememberDeath(player, player.getLocation());
        commands.rememberDeathTime(player);

        // В деморгане инвентарь и так забирает наказание — страховку не тратим.
        if (plugin.jail().isJailed(player)) return;
        if (!plugin.shop().has(player, "keepinv")) return;

        // Решение о сохранении вещей принимается прямо здесь: ждать ответа сайта
        // нельзя, событие уже произошло. Поэтому заряд сначала гасим локально,
        // а списание уходит следом — вторая смерть подряд страховку не получит.
        event.setKeepInventory(true);
        event.setKeepLevel(true);
        event.getDrops().clear();
        event.setDroppedExp(0);
        plugin.shop().spendLocally(player, "keepinv");

        plugin.shop().use(player, "keepinv",
                left -> player.sendMessage(messages.get("shop.keepinv-used",
                        java.util.Map.of("left", String.valueOf(left)))),
                status -> plugin.getLogger().warning(
                        "Не удалось списать страховку инвентаря у " + player.getName() + ": " + status));
    }
}
