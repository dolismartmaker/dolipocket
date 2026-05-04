@extends('layouts.app')

@section('content')
<section class="text-center py-10">
	<h1 class="text-4xl font-bold mb-4">Dolibarr dans votre poche</h1>
	<p class="text-lg text-slate-600 mb-8">Une application Dolibarr 100% smartphone, sans installation, sans configuration.</p>
	<a href="/signup" class="inline-block bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-6 py-3 rounded-lg font-semibold">
		Démarrer gratuitement
	</a>
</section>

<section class="grid sm:grid-cols-3 gap-6 mt-12">
	<div class="bg-white p-5 rounded-lg shadow-sm">
		<h2 class="font-semibold mb-2">Tiers et contacts</h2>
		<p class="text-sm text-slate-600">Gérez vos clients et fournisseurs depuis votre téléphone.</p>
	</div>
	<div class="bg-white p-5 rounded-lg shadow-sm">
		<h2 class="font-semibold mb-2">Factures et devis</h2>
		<p class="text-sm text-slate-600">Créez et envoyez vos factures en quelques tapotements.</p>
	</div>
	<div class="bg-white p-5 rounded-lg shadow-sm">
		<h2 class="font-semibold mb-2">100% souverain</h2>
		<p class="text-sm text-slate-600">Vos données restent en France, hébergées sur infra européenne.</p>
	</div>
</section>
@endsection
