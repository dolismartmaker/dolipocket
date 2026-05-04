@extends('layouts.app')

@section('content')
<div class="max-w-md mx-auto bg-white p-6 rounded-lg shadow-sm">
	<h1 class="text-2xl font-bold mb-2">Confirmer votre email</h1>
	<p class="text-sm text-slate-600 mb-4">
		Nous avons envoyé un code à <strong>{{ $email }}</strong>. Saisissez-le ci-dessous et choisissez un mot de passe.
	</p>

	@if (!empty($error))
		<div class="bg-red-50 text-red-700 px-3 py-2 rounded mb-4 text-sm">{{ $error }}</div>
	@endif

	<form method="post" action="/signup/verify" class="space-y-4" data-submit-once>
		<input type="hidden" name="token" value="{{ $csrf }}">

		<div>
			<label class="block text-sm font-medium mb-1" for="otp">Code reçu (6 chiffres)</label>
			<input id="otp" name="otp" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"
				class="w-full border border-slate-300 rounded px-3 py-2 tracking-widest text-center text-lg">
		</div>

		<div>
			<label class="block text-sm font-medium mb-1" for="password">Mot de passe (8 caractères minimum)</label>
			<input id="password" name="password" type="password" minlength="8" required autocomplete="new-password"
				class="w-full border border-slate-300 rounded px-3 py-2">
		</div>

		<button type="submit" class="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold py-2 rounded" data-loading-text="Création du compte en cours...">
			Activer mon compte
		</button>
	</form>
</div>
@endsection
