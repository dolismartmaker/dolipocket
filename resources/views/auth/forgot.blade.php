@extends('layouts.app')

@section('content')
<div class="max-w-md mx-auto bg-white p-6 rounded-lg shadow-sm">
	<h1 class="text-2xl font-bold mb-4">Mot de passe oublié</h1>

	@if (!empty($error))
		<div class="bg-red-50 text-red-700 px-3 py-2 rounded mb-4 text-sm">{{ $error }}</div>
	@endif
	@if (!empty($notice))
		<div class="bg-emerald-50 text-emerald-800 px-3 py-2 rounded mb-4 text-sm">{{ $notice }}</div>
	@endif

	<form method="post" action="/forgot" class="space-y-4" data-submit-once>
		<input type="hidden" name="token" value="{{ $csrf }}">

		<div>
			<label class="block text-sm font-medium mb-1" for="email">Email</label>
			<input id="email" name="email" type="email" required autocomplete="email"
				class="w-full border border-slate-300 rounded px-3 py-2">
		</div>

		<button type="submit" class="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold py-2 rounded" data-loading-text="Envoi du lien en cours...">
			Recevoir un lien de réinitialisation
		</button>
	</form>

	<p class="text-sm text-slate-500 mt-4">
		<a href="/login" class="underline">Retour à la connexion</a>
	</p>
</div>
@endsection
