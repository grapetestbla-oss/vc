package host.vanilla.core.cosmetics;

import host.vanilla.core.VanillaCorePlugin;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.ItemStack;

/** Косметическая шляпа не должна попадать в мир: её нельзя снять, выбросить и уронить. */
public final class CosmeticListener implements Listener {

    private final VanillaCorePlugin plugin;
    private final CosmeticEngine engine;

    public CosmeticListener(VanillaCorePlugin plugin, CosmeticEngine engine) {
        this.plugin = plugin;
        this.engine = engine;
    }

    @EventHandler(ignoreCancelled = true)
    public void onClick(InventoryClickEvent event) {
        if (engine.isHat(event.getCurrentItem()) || engine.isHat(event.getCursor())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(ignoreCancelled = true)
    public void onDrop(PlayerDropItemEvent event) {
        if (engine.isHat(event.getItemDrop().getItemStack())) event.setCancelled(true);
    }

    @EventHandler
    public void onDeath(PlayerDeathEvent event) {
        event.getDrops().removeIf(engine::isHat);
    }

    @EventHandler(ignoreCancelled = true)
    public void onPetHit(EntityDamageByEntityEvent event) {
        // Питомцы неуязвимы, но и бить ими нельзя — на всякий случай глушим обе стороны.
        if (event.getEntity().isCustomNameVisible() && event.getEntity().isInvulnerable()) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        engine.forget(event.getPlayer());
    }

    /**
     * Сняли шлем — возвращаем шляпу сразу, не дожидаясь плановой проверки.
     * Событие Paper срабатывает на любую смену брони, включая смерть и клик.
     */
    @EventHandler
    public void onArmorChange(com.destroystokyo.paper.event.player.PlayerArmorChangeEvent event) {
        if (event.getSlotType() != com.destroystokyo.paper.event.player.PlayerArmorChangeEvent.SlotType.HEAD) {
            return;
        }
        Player player = event.getPlayer();
        if (!engine.setOf(player).has(CosmeticSet.Kind.HAT)) return;

        ItemStack now = event.getNewItem();
        boolean freed = now == null || now.getType().isAir();
        if (!freed || engine.isHat(now)) return;

        // Через тик: во время самого события инвентарь менять нельзя.
        plugin.getServer().getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) plugin.reloadCosmetics(player);
        });
    }

    /** Возвращает шляпу на место, если игрок снял броню и слот освободился. */
    public void refreshHat(Player player) {
        ItemStack helmet = player.getInventory().getHelmet();
        if (helmet == null && engine.setOf(player).has(CosmeticSet.Kind.HAT)) {
            plugin.reloadCosmetics(player);
        }
    }
}
