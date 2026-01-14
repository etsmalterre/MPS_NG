import {
  Factory,
  ShoppingCart,
  Boxes,
  TrendingUp,
  Users,
  Package,
  Truck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function Dashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <header>
        <div className="flex items-center gap-3">
          <div className="icon-box-gold h-11 w-11">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-3xl font-heading font-bold tracking-tight">Tableau de bord</h1>
            <p className="text-sm text-muted-foreground">
              Vue d'ensemble de l'activité MPS
            </p>
          </div>
        </div>
        <div className="h-1 w-24 mt-4 rounded-full bg-gradient-to-r from-accent via-accent to-accent/30" />
      </header>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard
          title="Commandes"
          value="-"
          description="En cours"
          icon={ShoppingCart}
          variant="gold"
        />
        <StatCard
          title="Production"
          value="-"
          description="Ordres en cours"
          icon={Factory}
          variant="teal"
        />
        <StatCard
          title="Stock"
          value="-"
          description="Références"
          icon={Boxes}
          variant="gold"
        />
        <StatCard
          title="Expéditions"
          value="-"
          description="À traiter"
          icon={Truck}
          variant="teal"
        />
      </div>

      {/* Quick Access */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="card-premium">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="icon-box-gold h-10 w-10">
              <Users className="h-5 w-5" />
            </div>
            <CardTitle className="text-base font-semibold">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Gérez vos clients, commandes et devis
            </p>
          </CardContent>
        </Card>

        <Card className="card-premium">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="icon-box-teal h-10 w-10">
              <Factory className="h-5 w-5" />
            </div>
            <CardTitle className="text-base font-semibold">Production</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Tricotage, teinture et confection
            </p>
          </CardContent>
        </Card>

        <Card className="card-premium">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="icon-box-gold h-10 w-10">
              <Package className="h-5 w-5" />
            </div>
            <CardTitle className="text-base font-semibold">Fournisseurs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Commandes et gestion fournisseurs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Phase 1 Notice */}
      <div className="rounded-lg border border-gold/20 bg-gold/5 p-4">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-gold animate-pulse" />
          <p className="text-sm font-medium text-gold-foreground">
            Phase 1 - Interface en développement
          </p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette version présente l'interface utilisateur. Les données seront connectées dans la Phase 2.
        </p>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string
  description: string
  icon: React.ElementType
  variant: 'gold' | 'teal'
}

function StatCard({ title, value, description, icon: Icon, variant }: StatCardProps) {
  return (
    <Card className="card-premium stat-glow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={variant === 'gold' ? 'icon-box-gold h-8 w-8' : 'icon-box-teal h-8 w-8'}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-medium tabular-nums">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}
