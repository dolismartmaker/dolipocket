@extends('layouts.app')

@section('content')
<div class="max-w-md mx-auto bg-white p-6 rounded-lg shadow-sm text-center">
	<h1 class="text-2xl font-bold mb-2">Compte créé</h1>
	<p class="text-slate-600 mb-6">
		Votre compte Dolipocket est prêt. Connectez-vous pour accéder à votre application.
	</p>
	<a href="/login" class="inline-block bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-6 py-2 rounded">
		Se connecter
	</a>
	<p class="text-sm text-slate-500 mt-6">
		Astuce : depuis votre téléphone, ajoutez Dolipocket à l'écran d'accueil pour une expérience optimale.
	</p>
</div>
@endsection
