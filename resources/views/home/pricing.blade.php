@extends('layouts.app')

@section('content')
<h1 class="text-3xl font-bold mb-6">Tarifs</h1>
<div class="grid sm:grid-cols-2 gap-6">
	<div class="bg-white p-6 rounded-lg shadow-sm">
		<h2 class="text-xl font-semibold mb-2">Solo</h2>
		<p class="text-3xl font-bold mb-2">9 EUR<span class="text-base font-normal text-slate-500">/mois</span></p>
		<ul class="text-sm text-slate-600 space-y-1 mb-4">
			<li>1 utilisateur</li>
			<li>Tiers, factures, devis</li>
			<li>Support email</li>
		</ul>
		<a href="/signup" class="block text-center bg-slate-900 text-white px-4 py-2 rounded">S'inscrire</a>
	</div>
	<div class="bg-white p-6 rounded-lg shadow-sm border-2 border-emerald-500">
		<h2 class="text-xl font-semibold mb-2">Équipe</h2>
		<p class="text-3xl font-bold mb-2">29 EUR<span class="text-base font-normal text-slate-500">/mois</span></p>
		<ul class="text-sm text-slate-600 space-y-1 mb-4">
			<li>5 utilisateurs</li>
			<li>Toutes fonctionnalités</li>
			<li>Support prioritaire</li>
		</ul>
		<a href="/signup" class="block text-center bg-emerald-500 text-slate-900 px-4 py-2 rounded font-medium">S'inscrire</a>
	</div>
</div>
@endsection
