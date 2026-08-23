package host.vanilla.core.report;

import host.vanilla.core.VanillaCorePlugin;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;

/** Клик по репорту в меню — попытка взять его себе. */
public final class ReportMenuListener implements Listener {

    private final VanillaCorePlugin plugin;
    private final ReportManager reports;

    public ReportMenuListener(VanillaCorePlugin plugin, ReportManager reports) {
        this.plugin = plugin;
        this.reports = reports;
    }

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        if (!(event.getInventory().getHolder() instanceof ReportMenuHolder)) return;
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player admin)) return;
        if (plugin.auth().adminLevel(admin) < 2) return;

        ReportManager.Entry entry = reports.entryAt(event.getSlot());
        if (entry == null) return;
        admin.closeInventory();
        reports.claim(admin, entry);
    }
}
